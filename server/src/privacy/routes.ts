import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import * as storage from '../storage.ts';
import * as store from '../store.ts';
import * as providers from '../llm/providers.ts';
import { dropUserSessions } from '../llm/openai.ts';
import { cancelUserTasks, emit, forgetUserTasks } from '../tasks.ts';
import { currentUserId, userKey } from '../context.ts';
import * as consent from './consent.ts';
import { policyMarkdown, policyText, policyTitle, PRIVACY_DRAFT } from './policyText.ts';
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_VERSION } from './versions.ts';
import { POLICIES } from './policies.ts';
import { appUrl, rateLimited, sendMail } from '../auth.ts';
import { policyEmail } from '../emails.ts';

const enabledSources = () => providers.listProviders().filter((p) => p.enabled);
const language = (req: Request) => String(req.body?.language || req.acceptsLanguages()[0] || 'en').slice(0, 16);

function send(res: Response, fn: () => unknown) {
  try {
    res.json(fn());
  } catch (e: any) {
    if (e instanceof consent.ConsentRequiredError) return void res.status(403).json(e.body());
    res.status(e.code === 'DISCLOSURE_CHANGED' ? 409 : 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) });
  }
}

function statusFor(userId: string) {
  const s = consent.aiStatus(userId);
  const ack = consent.privacyAck(userId);
  return {
    state: s.state,
    preferences: s.preferences,
    current: s.current ? { at: s.current.at, consentVersion: s.current.consentVersion, action: s.current.action } : null,
    sources: s.sources,
    privacyAck: { required: ack.required, version: ack.last?.privacyVersion ?? null, at: ack.last?.at ?? null },
    versions: { ai: consent.AI_CONSENT_VERSION, privacy: PRIVACY_VERSION, privacyEffectiveDate: PRIVACY_EFFECTIVE_DATE },
  };
}

/** Routes anyone can use, signed in or not: the policy itself and the emailed copy (issue #25). */
export function mountPublicPrivacy(app: Express) {
  app.get('/api/privacy/policy', (_req, res) => {
    res.json({ title: policyTitle(), version: PRIVACY_VERSION, effectiveDate: PRIVACY_EFFECTIVE_DATE, draft: PRIVACY_DRAFT, markdown: policyMarkdown(appUrl()) });
  });

  /** Lists every kind of AI source and its data terms (the policy page's reference table). */
  app.get('/api/privacy/sources', (_req, res) => res.json(Object.values(POLICIES)));

  /**
   * Emails the current policy to the address typed on the sign-up form. Anyone can call this, so it is rate-limited,
   * the email is a fixed template with nothing from the request in it, and the address itself is never stored.
   */
  app.post('/api/privacy/email-copy', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
      return void res.status(400).json({ error: 'Please enter a valid email address to receive a copy of the Privacy Policy.' });
    const ip = req.get('x-forwarded-for')?.split(',')[0].trim() || req.socket.remoteAddress || '';
    if (rateLimited(`policy-email:${email}`, 2, 60 * 60_000) || rateLimited(`policy-ip:${ip}`, 5, 60 * 60_000))
      return void res.status(429).json({ error: 'Too many copies requested. Try again in an hour, or open the policy at /privacy.' });
    const hash = crypto.createHash('sha256').update(`policy-copy:${email}`).digest('hex').slice(0, 12);
    try {
      const base = appUrl();
      const { subject, text, html } = policyEmail({ to: email, title: policyTitle(), version: PRIVACY_VERSION, effectiveDate: PRIVACY_EFFECTIVE_DATE, url: `${base ?? ''}/privacy`, body: policyText(base) });
      await sendMail(email, subject, text, html);
      console.log(`[privacy] privacy_policy_copy_requested version=${PRIVACY_VERSION} status=sent to=${hash}`);
      res.json({ status: 'sent', message: 'A copy of the Privacy Policy has been sent to your email address.', sentAt: new Date().toISOString() });
    } catch (e: any) {
      console.log(`[privacy] privacy_policy_copy_requested version=${PRIVACY_VERSION} status=failed to=${hash} error=${String(e.message).slice(0, 120)}`);
      res.status(502).json({ error: 'We could not send the Privacy Policy. Please try again.' });
    }
  });
}

/** Signed-in routes: consent, preferences, withdrawal, acknowledgment and deletion (issues #19, #23, #24, #25). */
export function mountPrivacy(app: Express) {
  app.get('/api/consent', (_req, res) => send(res, () => ({ ...statusFor(currentUserId()), history: consent.history(currentUserId()) })));

  /** Everything the consent dialog shows. Preferences in the query only change the "what we send" table. */
  app.get('/api/privacy/disclosure', (req, res) =>
    send(res, () => consent.disclosure(currentUserId(), enabledSources(), req.query.includeName === undefined ? undefined : consent.cleanPreferences({ includeName: req.query.includeName === '1' }))),
  );

  app.post('/api/consent', (req, res) =>
    send(res, () => {
      const userId = currentUserId();
      const preferences = consent.cleanPreferences(req.body?.preferences);
      const enabled = enabledSources();
      const d = consent.disclosure(userId, enabled, preferences);
      // what the user saw must be what we record: a source added or changed in another tab makes the screen stale
      if (req.body?.disclosureHash !== d.hash) {
        const e: any = new Error('What we send, or where, changed while this screen was open. Review it again.');
        e.code = 'DISCLOSURE_CHANGED';
        throw e;
      }
      if (req.body?.agreed !== true) throw new Error('Please select the checkbox to agree to AI Resume Processing.');
      consent.record({
        type: 'ai_resume_processing',
        action: 'granted',
        consentVersion: consent.AI_CONSENT_VERSION,
        sources: consent.coveredFrom(enabled),
        preferences,
        disclosureHash: d.hash,
        language: language(req),
        via: 'in-app',
      });
      return statusFor(userId);
    }),
  );

  app.put('/api/consent/preferences', (req, res) =>
    send(res, () => {
      const userId = currentUserId();
      const s = consent.aiStatus(userId);
      if (s.state !== 'active') throw new consent.ConsentRequiredError(s.state === 'none' ? 'missing' : s.state === 'withdrawn' ? 'withdrawn' : 'expired');
      consent.record({
        type: 'ai_resume_processing',
        action: 'preferences_updated',
        consentVersion: s.current?.consentVersion,
        sources: s.sources,
        preferences: consent.cleanPreferences(req.body?.preferences),
        disclosureHash: s.current?.disclosureHash,
        language: language(req),
        via: 'in-app',
      });
      return statusFor(userId);
    }),
  );

  app.post('/api/consent/withdraw', (req, res) =>
    send(res, () => {
      const userId = currentUserId();
      const s = consent.aiStatus(userId);
      if (s.state === 'none' || s.state === 'withdrawn') return statusFor(userId);
      consent.record({ type: 'ai_resume_processing', action: 'withdrawn', consentVersion: s.current?.consentVersion, language: language(req), via: 'in-app' });
      const stopped = cancelUserTasks(userId, 'AI Resume Processing was turned off, so this run was stopped.');
      return { ...statusFor(userId), stoppedRuns: stopped };
    }),
  );

  /** Existing users (and anyone after a policy change) acknowledge the current Privacy Policy here. */
  app.post('/api/privacy/acknowledge', (req, res) =>
    send(res, () => {
      if (req.body?.version !== PRIVACY_VERSION) throw new Error('The Privacy Policy changed while this screen was open. Review the new version.');
      if (req.body?.acknowledged !== true) throw new Error('Please accept the Privacy Policy to continue.');
      if (req.body?.ageConfirmed !== true) throw new Error('Please confirm that you are 18 or older.');
      consent.record({ type: 'privacy_policy_acknowledgment', action: 'acknowledged', language: language(req), via: 'in-app', ageConfirmed: true });
      return statusFor(currentUserId());
    }),
  );

  /** Deletes resume data. Two steps in the UI; the API insists on the typed confirmation too. */
  app.post('/api/privacy/delete-data', async (req, res) => {
    if (req.body?.confirm !== 'DELETE') return void res.status(400).json({ error: 'Type DELETE to confirm.' });
    const userId = currentUserId();
    const startedAt = new Date().toISOString();
    try {
      const stopped = cancelUserTasks(userId, 'Your resume data is being deleted, so this run was stopped.');
      const { resumes } = store.deleteResumeData();
      const uploads = await storage.removeBinaryPrefix(userKey('uploads/'));
      dropUserSessions(userId);
      forgetUserTasks(userId);
      const done = {
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'completed',
        scope: 'resume_data',
        deleted: { resumes, uploads, profile: true, jobs: true, copilotSessions: true, taskHistory: true },
        stoppedRuns: stopped,
        // nothing we route to offers deletion of prompts already sent (stated on the Privacy page and in the policy)
        processorsNotified: false,
      };
      storage.writeText(userKey(`deletions/${startedAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(done, null, 2));
      await storage.flush();
      emit({ type: 'profile' });
      res.json({ ok: true, ...done });
    } catch (e: any) {
      console.error('[privacy] delete failed:', e.message);
      storage.writeText(userKey(`deletions/${startedAt.replace(/[:.]/g, '-')}.json`), JSON.stringify({ startedAt, status: 'failed', error: e.message }, null, 2));
      res.status(500).json({ error: 'Deleting your data didn’t finish. Try again; nothing already deleted comes back.' });
    }
  });
}
