import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import * as storage from '../storage.ts';
import { currentUserId } from '../context.ts';
import type { ProviderConfig } from '../llm/providers.ts';
import type { TaskKind } from '../types.ts';
import { APP_VERSION, AI_CONSENT_VERSION, PRIVACY_EFFECTIVE_DATE, PRIVACY_VERSION, SIGNUP_PAGE_VERSION, TERMS_VERSION, versions } from './versions.ts';
import { POLICIES, WEB_SEARCH, policyKeyOf, type PolicyKey } from './policies.ts';

/**
 * Consent and acknowledgment records (issues #19, #25).
 *
 * Every event is its own file, users/<id>/consent/<time>_<id>.json, written once and never changed, so the
 * history can't be rewritten. Status is worked out from the history, never stored.
 */

// ---------------------------------------------------------------- preferences

export type Feature = 'analyze' | 'tailor' | 'coverLetter' | 'interviewPrep' | 'copilot';

export const FEATURES: Record<Feature, { label: string; description: string; default: boolean }> = {
  analyze: { label: 'Match analysis and keyword gaps', description: 'Scores your resume against each role and lists missing keywords.', default: true },
  tailor: { label: 'Tailored resume', description: 'Rewrites your summary and bullets for a role, using only facts from your resume.', default: true },
  coverLetter: { label: 'Cover letters', description: 'Drafts a cover letter for a role.', default: false },
  interviewPrep: { label: 'Interview prep', description: 'Builds likely questions and STAR stories for a role.', default: false },
  copilot: { label: 'Copilot chat', description: 'Lets the copilot read your profile and resumes to answer and make edits.', default: true },
};

export interface Preferences {
  /** Send the name as written instead of a placeholder. */
  includeName: boolean;
  /** Always false in v1: the model never needs contact details (issue #21). */
  includeContact: false;
  features: Record<Feature, boolean>;
}

export const defaultPreferences = (): Preferences => ({
  includeName: false,
  includeContact: false,
  features: Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, f.default])) as Record<Feature, boolean>,
});

export function cleanPreferences(input: any): Preferences {
  const d = defaultPreferences();
  const features = { ...d.features };
  for (const k of Object.keys(FEATURES) as Feature[]) if (typeof input?.features?.[k] === 'boolean') features[k] = input.features[k];
  return { includeName: input?.includeName === true, includeContact: false, features };
}

/** The preference that controls a run. Imports and scans are covered by consent itself. */
export function featureFor(kind: TaskKind): Feature | null {
  switch (kind) {
    case 'analyze':
      return 'analyze';
    case 'tailor':
      return 'tailor';
    case 'cover-letter':
      return 'coverLetter';
    case 'interview-prep':
      return 'interviewPrep';
    case 'chat':
      return 'copilot';
    default:
      return null;
  }
}

// ---------------------------------------------------------------- records

export interface CoveredSource {
  id: string;
  kind: ProviderConfig['kind'];
  model: string;
  policy: PolicyKey;
}

export type ConsentType = 'ai_resume_processing' | 'privacy_policy_acknowledgment';
export type ConsentAction = 'granted' | 'preferences_updated' | 'withdrawn' | 'acknowledged';

export interface ConsentEvent {
  id: string;
  userId: string;
  type: ConsentType;
  action: ConsentAction;
  at: string;
  consentVersion?: string;
  privacyVersion: string;
  privacyEffectiveDate: string;
  termsVersion: string | null;
  sources?: CoveredSource[];
  preferences?: Preferences;
  /** Hash of the exact disclosure the user was shown. */
  disclosureHash?: string;
  language: string;
  appVersion: string;
  via: 'signup' | 'in-app';
  signupPageVersion?: string;
  ageConfirmed?: boolean;
  policyCopyRequested?: boolean;
  policyCopySentAt?: string;
}

const dir = (userId: string) => `users/${userId}/consent/`;

/** Writes one event. Must run as that user (inside the request or runAs for them). */
export function record(e: Omit<ConsentEvent, 'id' | 'userId' | 'at' | 'privacyVersion' | 'privacyEffectiveDate' | 'termsVersion' | 'appVersion'> & Partial<Pick<ConsentEvent, 'at'>>): ConsentEvent {
  const userId = currentUserId();
  const at = e.at ?? new Date().toISOString();
  const event: ConsentEvent = {
    id: nanoid(10),
    userId,
    at,
    privacyVersion: PRIVACY_VERSION,
    privacyEffectiveDate: PRIVACY_EFFECTIVE_DATE,
    termsVersion: TERMS_VERSION,
    appVersion: APP_VERSION,
    ...e,
  };
  const key = `${dir(userId)}${at.replace(/[:.]/g, '-')}_${event.id}.json`;
  if (storage.exists(key)) throw new Error('Consent record already exists'); // never overwrite
  storage.writeText(key, JSON.stringify(event, null, 2));
  return event;
}

export function history(userId: string): ConsentEvent[] {
  return storage
    .listFiles(dir(userId))
    .map((f) => {
      try {
        return JSON.parse(storage.readText(f.key) ?? '') as ConsentEvent;
      } catch {
        return undefined;
      }
    })
    .filter((e): e is ConsentEvent => !!e)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/** Another server instance may have written newer events. Returns true when anything changed. */
export const refresh = (userId: string) => storage.refreshPrefix(dir(userId));

// ---------------------------------------------------------------- status

export type AiState = 'none' | 'active' | 'expired' | 'withdrawn';

export interface AiStatus {
  state: AiState;
  /** The grant or preferences change in force (also set when expired, to show what was agreed). */
  current?: ConsentEvent;
  preferences: Preferences;
  sources: CoveredSource[];
}

const isCurrent = (e: ConsentEvent) => e.consentVersion === AI_CONSENT_VERSION && e.privacyVersion === PRIVACY_VERSION && e.termsVersion === TERMS_VERSION;

export function aiStatus(userId: string): AiStatus {
  const ai = history(userId).filter((e) => e.type === 'ai_resume_processing');
  const last = ai[ai.length - 1];
  if (!last) return { state: 'none', preferences: defaultPreferences(), sources: [] };
  if (last.action === 'withdrawn') {
    const prev = [...ai].reverse().find((e) => e.action !== 'withdrawn');
    return { state: 'withdrawn', current: prev, preferences: prev?.preferences ?? defaultPreferences(), sources: [] };
  }
  return {
    state: isCurrent(last) ? 'active' : 'expired',
    current: last,
    preferences: cleanPreferences(last.preferences),
    sources: last.sources ?? [],
  };
}

export function privacyAck(userId: string) {
  const acks = history(userId).filter((e) => e.type === 'privacy_policy_acknowledgment');
  const last = acks[acks.length - 1];
  return { required: last?.privacyVersion !== PRIVACY_VERSION, last };
}

export const covers = (sources: CoveredSource[], p: Pick<ProviderConfig, 'id' | 'kind' | 'baseUrl'>) =>
  sources.some((s) => s.id === p.id && s.kind === p.kind && s.policy === policyKeyOf(p));

// ---------------------------------------------------------------- the gate

export type DenyReason = 'missing' | 'expired' | 'withdrawn' | 'feature_off' | 'sources_changed';

const MESSAGES: Record<DenyReason, string> = {
  missing: 'You must agree to AI Resume Processing before using this feature.',
  expired: 'What we send to AI services, or who we send it to, has changed. Review it and agree again to keep using AI features.',
  withdrawn: 'You turned off AI Resume Processing. Turn it back on to use this feature.',
  feature_off: 'This AI feature is turned off in your privacy preferences.',
  sources_changed: 'An AI source you turned on isn’t covered by your consent yet. Review it and agree to continue.',
};

export class ConsentRequiredError extends Error {
  constructor(
    public reason: DenyReason,
    public feature?: Feature,
  ) {
    super(reason === 'feature_off' && feature ? `${FEATURES[feature].label} is turned off in your privacy preferences.` : MESSAGES[reason]);
  }
  body() {
    return { error: 'AI_PROCESSING_CONSENT_REQUIRED', message: this.message, action: 'SHOW_CONSENT_SCREEN', reason: this.reason, ...(this.feature ? { feature: this.feature } : {}) };
  }
}

/** Throws ConsentRequiredError unless the user has a current grant that allows this feature. */
export function requireActive(userId: string, feature: Feature | null): AiStatus {
  const s = aiStatus(userId);
  if (s.state === 'none') throw new ConsentRequiredError('missing', feature ?? undefined);
  if (s.state === 'withdrawn') throw new ConsentRequiredError('withdrawn', feature ?? undefined);
  if (s.state === 'expired') throw new ConsentRequiredError('expired', feature ?? undefined);
  if (feature && !s.preferences.features[feature]) throw new ConsentRequiredError('feature_off', feature);
  return s;
}

/** Same as requireActive, but looks for newer records written by another server instance before refusing. */
export async function requireActiveFresh(userId: string, feature: Feature | null): Promise<AiStatus> {
  try {
    return requireActive(userId, feature);
  } catch (e) {
    if (e instanceof ConsentRequiredError && (await refresh(userId))) return requireActive(userId, feature);
    throw e;
  }
}

/** For chained background runs: start them only when they'd be allowed, instead of failing them. */
export function allows(userId: string, feature: Feature | null) {
  try {
    requireActive(userId, feature);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- disclosure

export interface SentRow {
  item: string;
  sent: 'yes' | 'no';
  detail: string;
}

/** What goes to the AI service. Changing this list means bumping AI_CONSENT_VERSION. */
export function sentTable(prefs: Preferences): SentRow[] {
  return [
    { item: 'Resume text', sent: 'yes', detail: 'Work experience, skills, education and achievements, from your master resume and tailored copies' },
    { item: 'Employer and school names', sent: 'yes', detail: 'Part of the resume text' },
    { item: 'Achievements notes and LinkedIn profile text', sent: 'yes', detail: 'Only what you added on your profile' },
    { item: 'Job descriptions', sent: 'yes', detail: 'Job title, responsibilities and required skills' },
    { item: 'Target roles and your instructions', sent: 'yes', detail: 'For example “Make bullets more achievement-focused”' },
    {
      item: 'Copilot messages',
      sent: 'yes',
      detail: 'Sent as you type them. We replace your name and contact details when we spot them, but we can’t catch everything in free text.',
    },
    {
      item: 'Your name',
      sent: prefs.includeName ? 'yes' : 'no',
      detail: prefs.includeName ? 'Sent as written, because you chose to include it' : 'Replaced with a placeholder, then put back on our server',
    },
    { item: 'Email address', sent: 'no', detail: 'Replaced with a placeholder, then put back on our server' },
    { item: 'Phone number', sent: 'no', detail: 'Replaced with a placeholder, then put back on our server' },
    { item: 'Home location and street address', sent: 'no', detail: 'Your profile location, and anything that looks like a street address, is replaced' },
    { item: 'LinkedIn, GitHub and similar profile links', sent: 'no', detail: 'Replaced with a placeholder' },
    { item: 'Your original resume file', sent: 'no', detail: 'We extract the text on our server; the file itself never goes to an AI service' },
    { item: 'Profile photo', sent: 'no', detail: 'The app never asks for one' },
  ];
}

export interface DisclosedSource {
  id: string;
  name: string;
  kind: ProviderConfig['kind'];
  model: string;
  policy: (typeof POLICIES)[PolicyKey];
  fallbackOnly: boolean;
  covered: boolean;
}

/** Everything the consent dialog shows about where data goes, for the signed-in user's enabled sources. */
export function disclosure(userId: string, enabled: ProviderConfig[], prefs?: Preferences) {
  const status = aiStatus(userId);
  const p = prefs ?? status.preferences;
  const sources: DisclosedSource[] = enabled.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    model: s.model,
    policy: POLICIES[policyKeyOf(s)],
    fallbackOnly: s.fallbackOnly,
    covered: status.state === 'active' && covers(status.sources, s),
  }));
  const thirdParty = sources.filter((s) => s.policy.thirdParty);
  const worst = {
    training: thirdParty.some((s) => s.policy.training !== 'no') ? ('may' as const) : ('no' as const),
    humanReview: thirdParty.some((s) => !!s.policy.humanReview),
    thirdParty: thirdParty.length > 0,
  };
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ v: versions(), s: sources.map((s) => [s.id, s.kind, s.model, s.policy.key]) }))
    .digest('hex')
    .slice(0, 24);
  return { versions: versions(), sources, worst, webSearch: WEB_SEARCH, sent: sentTable(p), features: FEATURES, hash };
}

export const coveredFrom = (enabled: ProviderConfig[]): CoveredSource[] =>
  enabled.map((s) => ({ id: s.id, kind: s.kind, model: s.model, policy: policyKeyOf(s) }));

export { AI_CONSENT_VERSION, SIGNUP_PAGE_VERSION };
