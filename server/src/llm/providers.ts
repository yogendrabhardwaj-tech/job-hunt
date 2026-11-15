import { nanoid } from 'nanoid';
import { now } from '../store.ts';
import * as storage from '../storage.ts';

/**
 * AI sources ("providers") and the router that spreads agent runs across them.
 * Everything except `claude` speaks the OpenAI chat-completions API (OpenRouter, Hugging Face router,
 * Google Gemini's OpenAI endpoint, OpenAI, LM Studio). Stored in data/settings.json — API keys never leave the server.
 *
 * Bring-your-own-key: a key is written to disk only when the user opts in (`saveKey`). Otherwise it lives in
 * memory, tied to the browser tab that entered it, and is dropped when that tab closes or the server restarts.
 */

export type ProviderKind = 'openrouter' | 'openai' | 'huggingface' | 'google' | 'lmstudio' | 'openai-compatible' | 'claude';

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  /** Stored key; empty unless the user chose to save it. Use `keyFor()` to get the key in effect. */
  apiKey: string;
  /** Remember the key in data/settings.json. When false the key is kept for the browser session only. */
  saveKey: boolean;
  model: string;
  enabled: boolean;
  /** Only used when every other source is unavailable or has failed. */
  fallbackOnly: boolean;
  /** Relative share of runs in balanced mode (1–10). */
  weight: number;
  /** Max runs per day (UTC); 0 = no cap. */
  dailyLimit: number;
  maxTokens: number;
}

export interface ProviderUsage {
  day: string;
  runs: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  failures: number;
  totalRuns: number;
  lastUsed?: string;
  lastError?: string;
  lastErrorAt?: string;
  cooldownUntil?: string;
}

export type Strategy = 'balanced' | 'priority';

interface Settings {
  strategy: Strategy;
  providers: ProviderConfig[];
  usage: Record<string, ProviderUsage>;
}

export const PRESETS: Record<ProviderKind, { label: string; baseUrl: string; needsKey: boolean; keyUrl?: string; helpAnchor?: string; modelHint: string; note: string }> = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/settings/keys',
    helpAnchor: 'openrouter',
    modelHint: 'a model ending in :free',
    note: 'Choose a model ending in ":free" that supports tools. Free models are rate-limited per account (roughly 20 requests a minute, and a small daily cap that rises after a one-time credit purchase).',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    helpAnchor: 'openai',
    modelHint: 'click Load models and pick one',
    note: 'Paid, billed per token to your OpenAI account; add credit under Billing before the key works. Smaller "mini" models are much cheaper and handle these tasks well.',
  },
  huggingface: {
    label: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    needsKey: true,
    keyUrl: 'https://huggingface.co/settings/tokens',
    modelHint: 'e.g. Qwen/Qwen3-235B-A22B-Instruct-2507',
    note: 'Uses Inference Providers. Free accounts get a small monthly credit. Use a token with the "Make calls to Inference Providers" permission, and pick a model whose provider supports tool calling.',
  },
  google: {
    label: 'Google AI Studio (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    helpAnchor: 'google',
    modelHint: 'e.g. gemini-2.5-flash',
    note: 'Free tier of the Gemini API from Google AI Studio. Daily and per-minute limits depend on the model; Flash models have the most generous free quota.',
  },
  lmstudio: {
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    modelHint: 'the model identifier shown in LM Studio',
    note: 'In LM Studio open Developer and start the server. To use it from another machine, turn on "Serve on local network" and use http://<that-machine-ip>:1234/v1. Load a model that supports tool use, with a context length of at least 32k.',
  },
  'openai-compatible': {
    label: 'Other (OpenAI-compatible)',
    baseUrl: '',
    needsKey: false,
    modelHint: 'model id',
    note: 'Any server that implements the OpenAI /chat/completions API with tool calling (Ollama, vLLM, Groq, Cerebras, …).',
  },
  claude: {
    label: 'Claude (your Claude plan)',
    baseUrl: '',
    needsKey: false,
    modelHint: 'claude-opus-5-5',
    note: 'Uses your existing `claude` CLI login and counts against your Claude plan, not free. By default it only runs when every free source has failed.',
  },
};

const FILE = 'settings.json';
const today = () => new Date().toISOString().slice(0, 10);

function defaults(): Settings {
  return {
    strategy: 'balanced',
    providers: [
      {
        id: 'claude',
        kind: 'claude',
        name: 'Claude',
        baseUrl: '',
        apiKey: '',
        saveKey: false,
        model: process.env.AGENT_MODEL || 'claude-opus-5-5',
        enabled: true,
        fallbackOnly: true,
        weight: 1,
        dailyLimit: 0,
        maxTokens: 0,
      },
    ],
    usage: {},
  };
}

function load(): Settings {
  const raw = storage.readText(FILE);
  if (!raw) return defaults();
  const s: Settings = { ...defaults(), ...JSON.parse(raw) };
  // sources from before BYOK: a key already on disk was saved on purpose
  for (const p of s.providers) p.saveKey ??= !!p.apiKey;
  return s;
}

const settings = load();

function persist() {
  storage.writeText(FILE, JSON.stringify(settings, null, 2));
}

function usage(id: string): ProviderUsage {
  let u = settings.usage[id];
  if (!u) u = settings.usage[id] = { day: today(), runs: 0, requests: 0, promptTokens: 0, completionTokens: 0, failures: 0, totalRuns: 0 };
  if (u.day !== today()) Object.assign(u, { day: today(), runs: 0, requests: 0, promptTokens: 0, completionTokens: 0, failures: 0 });
  return u;
}

// ---------------------------------------------------------------- session-only keys (BYOK)

/** How long a tab's keys survive without a heartbeat. Covers background-tab timer throttling. */
const SESSION_TTL = 3 * 60_000;
/** After the tab says it is closing: long enough for a reload to check back in. */
const CLOSE_GRACE = 15_000;

const sessions = new Map<string, { expires: number; keys: Map<string, string> }>();

export const validSessionId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(id);

function sweep() {
  const t = Date.now();
  for (const [id, s] of sessions) if (s.expires <= t) sessions.delete(id);
}
setInterval(sweep, 15_000).unref();

/** The tab is still open. Creates the session on first contact. */
export function touchSession(sid: string) {
  const s = sessions.get(sid);
  if (s) s.expires = Date.now() + SESSION_TTL;
  else sessions.set(sid, { expires: Date.now() + SESSION_TTL, keys: new Map() });
}

/** The tab is closing (or reloading). Keys go unless the tab checks back in within the grace period. */
export function endSession(sid: string) {
  const s = sessions.get(sid);
  if (s) s.expires = Math.min(s.expires, Date.now() + CLOSE_GRACE);
}

function setSessionKey(sid: string | undefined, providerId: string, key: string) {
  if (!sid) throw new Error('Your browser session was not recognised; reload the page and enter the key again');
  touchSession(sid);
  sessions.get(sid)!.keys.set(providerId, key);
}

function sessionKey(providerId: string): string {
  sweep();
  for (const s of sessions.values()) {
    const k = s.keys.get(providerId);
    if (k) return k;
  }
  return '';
}

function dropSessionKeys(providerId: string) {
  for (const s of sessions.values()) s.keys.delete(providerId);
}

/** The key in effect for a source: the saved one, else one entered in an open browser tab. */
export function keyFor(p: Pick<ProviderConfig, 'apiKey'> & { id?: string }): string {
  return p.apiKey || (p.id ? sessionKey(p.id) : '');
}

/** Applies the key fields of a form submission: decides between disk and session memory. */
function applyKey(p: ProviderConfig, input: Partial<ProviderConfig>, prevKey: string, sid?: string) {
  const typed = input.apiKey ? String(input.apiKey).trim() : '';
  const key = typed || prevKey || sessionKey(p.id);
  if (p.saveKey) {
    p.apiKey = key;
    dropSessionKeys(p.id);
  } else {
    p.apiKey = '';
    // a newly typed key, or a saved key the user just chose to stop saving, moves into this session
    if (typed || prevKey) setSessionKey(sid, p.id, typed || prevKey);
  }
}

/** Forget a source's key everywhere: on disk and in every open session. */
export function forgetKey(id: string) {
  const p = settings.providers.find((x) => x.id === id);
  if (!p) throw new Error('Source not found');
  p.apiKey = '';
  p.saveKey = false;
  dropSessionKeys(id);
  persist();
}

// ---------------------------------------------------------------- CRUD (used by the settings API)

const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

function sanitize(input: Partial<ProviderConfig>, base: ProviderConfig): ProviderConfig {
  const kind = (input.kind && input.kind in PRESETS ? input.kind : base.kind) as ProviderKind;
  return {
    ...base,
    kind,
    name: String(input.name ?? base.name).trim() || PRESETS[kind].label,
    baseUrl: String(input.baseUrl ?? base.baseUrl).trim().replace(/\/+$/, ''),
    apiKey: base.apiKey, // set by applyKey()
    saveKey: input.saveKey ?? base.saveKey,
    model: String(input.model ?? base.model).trim(),
    enabled: input.enabled ?? base.enabled,
    fallbackOnly: input.fallbackOnly ?? base.fallbackOnly,
    weight: clampInt(input.weight ?? base.weight, 1, 10, 1),
    dailyLimit: clampInt(input.dailyLimit ?? base.dailyLimit, 0, 100_000, 0),
    maxTokens: clampInt(input.maxTokens ?? base.maxTokens, 0, 200_000, 8192),
  };
}

export function addProvider(input: Partial<ProviderConfig>, sid?: string): ProviderConfig {
  const kind = (input.kind ?? 'openai-compatible') as ProviderKind;
  if (!(kind in PRESETS)) throw new Error(`Unknown source type ${kind}`);
  const blank: ProviderConfig = {
    id: nanoid(8),
    kind,
    name: PRESETS[kind].label,
    baseUrl: PRESETS[kind].baseUrl,
    apiKey: '',
    saveKey: false,
    model: '',
    enabled: true,
    fallbackOnly: kind === 'claude',
    weight: kind === 'lmstudio' ? 3 : 1,
    dailyLimit: 0,
    maxTokens: 8192,
  };
  const p = sanitize(input, blank);
  applyKey(p, input, '', sid);
  settings.providers.push(p);
  persist();
  return p;
}

export function updateProvider(id: string, patch: Partial<ProviderConfig>, sid?: string): ProviderConfig {
  const i = settings.providers.findIndex((p) => p.id === id);
  if (i < 0) throw new Error('Source not found');
  const prevKey = settings.providers[i].apiKey;
  settings.providers[i] = sanitize({ ...patch, kind: settings.providers[i].kind }, settings.providers[i]);
  // only touch keys when the patch is about keys (toggling "enabled" must not move a key around)
  if (patch.apiKey || patch.saveKey !== undefined) applyKey(settings.providers[i], patch, prevKey, sid);
  // config changed — give it a fresh chance
  delete usage(id).cooldownUntil;
  persist();
  return settings.providers[i];
}

export function removeProvider(id: string) {
  settings.providers = settings.providers.filter((p) => p.id !== id);
  delete settings.usage[id];
  dropSessionKeys(id);
  persist();
}

export function reorder(ids: string[]) {
  const pos = new Map(ids.map((id, i) => [id, i]));
  settings.providers.sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
  persist();
}

export function setStrategy(s: Strategy) {
  if (s !== 'balanced' && s !== 'priority') throw new Error('bad strategy');
  settings.strategy = s;
  persist();
}

export function getProvider(id: string) {
  return settings.providers.find((p) => p.id === id);
}

/** What the browser sees: keys masked, plus today's usage and current availability. */
export function publicSettings() {
  return {
    strategy: settings.strategy,
    presets: PRESETS,
    providers: settings.providers.map((p) => {
      const { apiKey, ...rest } = p;
      const key = keyFor(p);
      return {
        ...rest,
        apiKeySet: !!key,
        keySaved: !!apiKey,
        keyInSession: !apiKey && !!key,
        apiKeyHint: key ? `…${key.slice(-4)}` : '',
        usage: usage(p.id),
        availability: availability(p),
      };
    }),
  };
}

// ---------------------------------------------------------------- routing

export type Availability = { ok: true } | { ok: false; reason: string };

export function availability(p: ProviderConfig): Availability {
  if (!p.enabled) return { ok: false, reason: 'Turned off' };
  if (p.kind !== 'claude') {
    if (!p.baseUrl) return { ok: false, reason: 'Needs a base URL' };
    if (!p.model) return { ok: false, reason: 'Needs a model' };
    if (PRESETS[p.kind].needsKey && !keyFor(p)) return { ok: false, reason: p.saveKey ? 'Needs an API key' : 'Enter your key for this session' };
  }
  const u = usage(p.id);
  if (u.cooldownUntil && u.cooldownUntil > now()) return { ok: false, reason: `Paused until ${new Date(u.cooldownUntil).toLocaleTimeString()}` };
  if (p.dailyLimit && u.runs >= p.dailyLimit) return { ok: false, reason: `Daily limit of ${p.dailyLimit} runs reached` };
  return { ok: true };
}

/** Ordered list of sources to try for one run: primary sources (by strategy), then fallback-only ones. */
export function routeOrder(): ProviderConfig[] {
  const live = settings.providers.filter((p) => availability(p).ok);
  const primary = live.filter((p) => !p.fallbackOnly);
  if (settings.strategy === 'balanced') {
    const load = (p: ProviderConfig) => usage(p.id).runs / p.weight;
    primary.sort((a, b) => load(a) - load(b) || (usage(a.id).lastUsed ?? '').localeCompare(usage(b.id).lastUsed ?? ''));
  }
  return [...primary, ...live.filter((p) => p.fallbackOnly)];
}

export function whyNothingAvailable(): string {
  const reasons = settings.providers.map((p) => `${p.name}: ${(availability(p) as { reason: string }).reason}`);
  return `No AI source is available${reasons.length ? ` (${reasons.join('; ')})` : ''}. Add or enable one on the Settings page.`;
}

/** Called when a source is picked, so concurrent runs spread out before any of them finish. */
export function beginRun(id: string) {
  const u = usage(id);
  u.runs++;
  u.totalRuns++;
  u.lastUsed = now();
  persist();
}

export function recordRequest(id: string, tokens?: { prompt?: number; completion?: number }) {
  const u = usage(id);
  u.requests++;
  u.promptTokens += tokens?.prompt ?? 0;
  u.completionTokens += tokens?.completion ?? 0;
  persist();
}

export function recordSuccess(id: string) {
  const u = usage(id);
  delete u.cooldownUntil;
  persist();
}

export function recordFailure(id: string, message: string, cooldownMs: number) {
  const u = usage(id);
  u.failures++;
  u.lastError = message.slice(0, 500);
  u.lastErrorAt = now();
  if (cooldownMs > 0) u.cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
  persist();
}

export function clearCooldown(id: string) {
  delete usage(id).cooldownUntil;
  persist();
}

export function summary(): string {
  const primary = settings.providers.filter((p) => !p.fallbackOnly && availability(p).ok);
  if (primary.length === 1) return `${primary[0].name} · ${primary[0].model}`;
  if (primary.length > 1) return `${primary.length} free sources · ${settings.strategy}`;
  const any = routeOrder()[0];
  return any ? `${any.name} · ${any.model}` : 'no AI source';
}
