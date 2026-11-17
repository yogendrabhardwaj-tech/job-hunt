import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { runAs } from '../src/context.ts';
import * as store from '../src/store.ts';
import * as storage from '../src/storage.ts';
import * as providers from '../src/llm/providers.ts';
import { createTask } from '../src/tasks.ts';
import { CancelledError, runAgent } from '../src/agent.ts';
import * as consent from '../src/privacy/consent.ts';
import type { TaskKind } from '../src/types.ts';

/**
 * A fake OpenAI-compatible model server. Each test queues the replies it wants; every request body is kept so the
 * tests can count requests and check what was sent.
 */
interface Fake {
  url: string;
  bodies: any[];
  replies: ((body: any) => { status?: number; json: any })[];
  close: () => Promise<void>;
}

async function fakeServer(): Promise<Fake> {
  const f: Partial<Fake> = { bodies: [], replies: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      f.bodies!.push(body);
      const next: (body: any) => { status?: number; json: any } =
        f.replies!.shift() ?? (() => ({ json: { choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }] } }));
      const { status = 200, json } = next(body);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  f.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  f.close = () => new Promise((r) => server.close(() => r()));
  return f as Fake;
}

const callTool = (name: string, args: object) => () => ({
  json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] },
});

const PROFILE = { name: 'Jane Q. Doe', email: 'jane.doe@example.com', phone: '302-555-0142', location: 'Wilmington, DE', linkedinUrl: 'https://www.linkedin.com/in/jane-doe' };
const PII = ['jane.doe@example.com', '302-555-0142', 'Wilmington', 'Jane', 'Doe', 'jane-doe'];

let fake: Fake;
let other: Fake;
beforeAll(async () => {
  fake = await fakeServer();
  other = await fakeServer();
});
afterAll(async () => {
  await fake.close();
  await other.close();
});

let n = 0;
/** A fresh user with a profile, the Claude plan source turned off, and one fake source. */
function asNewUser<T>(fn: (ids: { a: string }) => Promise<T>): Promise<T> {
  const userId = `user${++n}`;
  return runAs({ userId, email: `${userId}@example.com` }, async () => {
    store.updateProfile(PROFILE);
    store.writeResume('master_resume.md', `# ${PROFILE.name}\n${PROFILE.email} · ${PROFILE.phone} · ${PROFILE.location}\n\n## Experience\n### Engineer — Acme\n- Built things`);
    if (providers.getProvider('claude')) providers.updateProvider('claude', { enabled: false });
    const a = providers.addProvider({ kind: 'openai-compatible', name: 'Fake A', baseUrl: fake.url, model: 'fake-a' });
    return fn({ a: a.id });
  });
}

const enabled = () => providers.listProviders().filter((p) => p.enabled);
function grant(prefs?: Partial<consent.Preferences>) {
  consent.record({
    type: 'ai_resume_processing',
    action: 'granted',
    consentVersion: consent.AI_CONSENT_VERSION,
    sources: consent.coveredFrom(enabled()),
    preferences: { ...consent.defaultPreferences(), ...prefs },
    language: 'en',
    via: 'in-app',
  });
}

/** A one-tool run shaped like the workflows: the model must call `save`, which records what it received. */
function saveRun(kind: TaskKind = 'tailor', prompt = `Tailor this:\n${store.readMaster()}`) {
  const saved: any[] = [];
  const save = tool('save', 'Save the result', { markdown: z.string() }, async (a) => {
    saved.push(a);
    return { content: [{ type: 'text' as const, text: 'saved' }] };
  });
  const task = createTask(kind, 'test');
  return { saved, run: () => runAgent({ task, system: 'You are a test.', prompt, tools: [save] }) };
}

describe('consent gate (issue #20)', () => {
  it('sends nothing without consent, for every kind of run', async () => {
    await asNewUser(async () => {
      const before = fake.bodies.length;
      for (const kind of ['scan', 'import-resume', 'analyze', 'tailor', 'cover-letter', 'interview-prep', 'chat'] as TaskKind[]) {
        const { run } = saveRun(kind);
        await expect(run()).rejects.toBeInstanceOf(consent.ConsentRequiredError);
      }
      expect(fake.bodies.length).toBe(before);
    });
  });

  it('runs once consent is given, without contact details or the name in the request', async () => {
    await asNewUser(async () => {
      grant();
      fake.replies.push(callTool('save', { markdown: '# [[NAME]]\n[[EMAIL]] · [[PHONE]]' }));
      const before = fake.bodies.length;
      const { run, saved } = saveRun();
      await run();
      expect(fake.bodies.length).toBe(before + 1);
      const sent = JSON.stringify(fake.bodies.at(-1).messages);
      for (const v of PII) expect(sent, v).not.toContain(v);
      // the save tool got the real values back
      expect(saved[0].markdown).toBe(`# ${PROFILE.name}\n${PROFILE.email} · ${PROFILE.phone}`);
    });
  });

  it('refuses a feature the user turned off', async () => {
    await asNewUser(async () => {
      grant(); // cover letters are off by default
      const before = fake.bodies.length;
      const { run } = saveRun('cover-letter');
      const err = await run().catch((e) => e);
      expect(err).toBeInstanceOf(consent.ConsentRequiredError);
      expect(err.reason).toBe('feature_off');
      expect(err.body()).toMatchObject({ error: 'AI_PROCESSING_CONSENT_REQUIRED', action: 'SHOW_CONSENT_SCREEN', feature: 'coverLetter' });
      expect(fake.bodies.length).toBe(before);
    });
  });

  it('stops at the next model request when consent is withdrawn mid-run', async () => {
    await asNewUser(async () => {
      grant();
      const peek = tool('peek', 'Look at something', {}, async () => {
        consent.record({ type: 'ai_resume_processing', action: 'withdrawn', language: 'en', via: 'in-app' });
        return { content: [{ type: 'text' as const, text: 'ok' }] };
      });
      const save = tool('save', 'Save', { markdown: z.string() }, async () => ({ content: [{ type: 'text' as const, text: 'saved' }] }));
      fake.replies.push(callTool('peek', {}));
      const before = fake.bodies.length;
      const task = createTask('tailor', 'test');
      await expect(runAgent({ task, system: 's', prompt: 'p', tools: [peek, save] })).rejects.toBeInstanceOf(consent.ConsentRequiredError);
      expect(fake.bodies.length).toBe(before + 1);
    });
  });

  it('saves nothing and stops once the user deletes their data mid-run', async () => {
    await asNewUser(async () => {
      grant();
      const saved: unknown[] = [];
      const save = tool('save', 'Save', { markdown: z.string() }, async (a) => {
        saved.push(a);
        return { content: [{ type: 'text' as const, text: 'saved' }] };
      });
      const task = createTask('tailor', 'test');
      // the deletion lands (e.g. on another server instance) while the model is still answering
      fake.replies.push(() => {
        storage.writeText(`users/user${n}/deletions/now.json`, JSON.stringify({ startedAt: new Date().toISOString(), status: 'completed' }));
        return callTool('save', { markdown: 'x' })();
      });
      const before = fake.bodies.length;
      await expect(runAgent({ task, system: 's', prompt: 'p', tools: [save, tool('noop', 'n', {}, async () => ({ content: [] }))] })).rejects.toBeInstanceOf(CancelledError);
      expect(saved).toEqual([]);
      expect(fake.bodies.length).toBe(before + 1);
    });
  });

  it('never fails over to a source the consent does not cover', async () => {
    await asNewUser(async () => {
      grant(); // covers Fake A only
      providers.addProvider({ kind: 'openai-compatible', name: 'Fake B', baseUrl: other.url, model: 'fake-b' });
      fake.replies.push(() => ({ status: 500, json: { error: { message: 'boom' } } }));
      const otherBefore = other.bodies.length;
      const { run } = saveRun();
      await expect(run()).rejects.toThrow(/boom/);
      expect(other.bodies.length).toBe(otherBefore);
    });
  });

  it('asks for consent again when the only enabled source is not covered', async () => {
    await asNewUser(async ({ a }) => {
      grant();
      providers.updateProvider(a, { enabled: false });
      providers.addProvider({ kind: 'openai-compatible', name: 'Fake B', baseUrl: other.url, model: 'fake-b' });
      const err = await saveRun().run().catch((e) => e);
      expect(err).toBeInstanceOf(consent.ConsentRequiredError);
      expect(err.reason).toBe('sources_changed');
    });
  });

  it('asks OpenRouter to skip hosts that keep or train on prompts', async () => {
    await asNewUser(async ({ a }) => {
      providers.updateProvider(a, { enabled: false });
      providers.addProvider({ kind: 'openrouter', name: 'OR', baseUrl: fake.url, model: 'some/model:free', apiKey: 'sk-test', saveKey: true });
      grant();
      fake.replies.push(callTool('save', { markdown: 'x' }));
      await saveRun().run();
      expect(fake.bodies.at(-1).provider).toEqual({ data_collection: 'deny' });
    });
  });
});

describe('consent records (issue #19)', () => {
  it('writes every event to its own file and never rewrites one', async () => {
    await asNewUser(async () => {
      grant();
      grant();
      const files = storage.listFiles(`users/user${n}/consent/`);
      expect(files).toHaveLength(2);
      const h = consent.history(`user${n}`);
      expect(h.map((e) => e.action)).toEqual(['granted', 'granted']);
    });
  });

  it('treats a grant for an older version as expired', async () => {
    await asNewUser(async () => {
      consent.record({ type: 'ai_resume_processing', action: 'granted', consentVersion: '0.9', sources: consent.coveredFrom(enabled()), preferences: consent.defaultPreferences(), language: 'en', via: 'in-app' });
      expect(consent.aiStatus(`user${n}`).state).toBe('expired');
      const err = await saveRun().run().catch((e) => e);
      expect(err.reason).toBe('expired');
    });
  });

  it('says a new user must acknowledge the Privacy Policy, and not after they have', async () => {
    await asNewUser(async () => {
      expect(consent.privacyAck(`user${n}`).required).toBe(true);
      consent.record({ type: 'privacy_policy_acknowledgment', action: 'acknowledged', language: 'en', via: 'in-app', ageConfirmed: true });
      expect(consent.privacyAck(`user${n}`).required).toBe(false);
    });
  });
});

describe('deleting resume data (issue #24)', () => {
  it('removes the profile, jobs, resumes and pending import but keeps consent records', async () => {
    await asNewUser(async () => {
      grant();
      store.createJob({ url: 'https://example.com/jobs/1', jdText: 'x'.repeat(700) });
      store.savePendingImport('raw resume text');
      store.deleteResumeData();
      const keys = storage.listFiles(`users/user${n}/`).map((f) => f.key.replace(`users/user${n}/`, ''));
      expect(keys.some((k) => k.startsWith('resumes/'))).toBe(false);
      expect(keys).not.toContain('pending-import.txt');
      expect(keys.some((k) => k.startsWith('consent/'))).toBe(true);
      expect(store.listJobs()).toEqual([]);
      expect(store.getProfile().name).toBe('');
      expect(store.getProfile().email).toBe(PROFILE.email);
    });
  });
});
