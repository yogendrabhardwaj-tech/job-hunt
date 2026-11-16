import { nanoid } from 'nanoid';
import { now } from '../store.ts';
import * as storage from '../storage.ts';
import { currentUserId, maybeUserId, userKey } from '../context.ts';
import { logUsage } from '../usageLog.ts';

/**
 * AI sources ("providers") and the router that spreads agent runs across them.
 * Everything except `claude` speaks the OpenAI chat-completions API (OpenRouter, NaraRouter, Hugging Face router,
 * Google Gemini's OpenAI endpoint, OpenAI, LM Studio). Stored in data/settings.json — API keys never leave the server.
 *
 * Bring-your-own-key: a key is written to disk only when the user opts in (`saveKey`). Otherwise it lives in
 * memory, tied to the browser tab that entered it, and is dropped when that tab closes or the server restarts.
 */

export type ProviderKind = 'openrouter' | 'nararouter' | 'openai' | 'huggingface' | 'google' | 'lmstudio' | 'openai-compatible' | 'claude';

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
  /** The app's own free source (see INCLUDED_ID). Its key comes from the server environment, never from users. */
  builtin?: boolean;
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
  nararouter: {
    label: 'NaraRouter',
    baseUrl: 'https://router.bynara.id/v1',
    needsKey: true,
    keyUrl: 'https://router.bynara.id',
    helpAnchor: 'nararouter',
    modelHint: 'a combo such as combo/free-pack, or click Load models',
    note: 'An OpenAI-compatible router with free models. Its "combos" bundle up to 5 models that are tried in turn, so a busy free model doesn\'t stop the run: create one under Developer → Model combos and use it as the model (combo/<name>). Keys start with sk-nry-.',
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
    note: 'In LM Studio open Developer and start the server. To use it from another machine, turn on "Serve on local network" and use http://<that-machine-ip>:1234/v1. Load a model that supports tool use, with a context length of at least 32k. If you turned on authentication in LM Studio\'s server settings, paste one of its API tokens as the key.',
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

/** Uses the Claude CLI login of the machine the server runs on, so only offered when running locally. */
export const claudeAllowed = !process.env.VERCEL;

function defaults(): Settings {
  return {
    strategy: 'balanced',
    providers: claudeAllowed ? [
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
    ] : [],
    usage: {},
  };
}

// ---------------------------------------------------------------- included free sources

/**
 * When the server has a key for a free router (OPENROUTER_API_KEY, NARAROUTER_API_KEY), users who haven't brought
 * a key of their own still get AI: built-in sources that run free models with the app's key. They're fallback-only,
 * so any working key the user adds is used first. Users can turn them off or change the model, but can't see,
 * change or remove the key.
 */
interface Included {
  id: string;
  kind: ProviderKind;
  name: string;
  key: string;
  model: string;
  dailyLimit: number;
  note: string;
}

const env = (k: string) => (process.env[k] ?? '').trim();

const INCLUDED: Included[] = [
  {
    id: 'included-free',
    kind: 'openrouter',
    name: 'Free models (included)',
    key: env('OPENROUTER_API_KEY'),
    model: env('OPENROUTER_FREE_MODEL') || 'openrouter/free',
    dailyLimit: Number(env('OPENROUTER_FREE_DAILY_RUNS') || 0),
    note: 'Included with the app, no key needed. Runs free models through OpenRouter (openrouter/free picks one at random). Free models are rate-limited and shared by everyone using this app, so runs can be slow or paused at busy times; adding your own key avoids that. Some free model providers may log prompts, which here include your resume.',
  },
  {
    id: 'included-nara',
    kind: 'nararouter',
    name: 'NaraRouter (included)',
    key: env('NARAROUTER_API_KEY'),
    // a combo (combo/<name>) set up in the app owner's NaraRouter dashboard, or a single model alias
    model: env('NARAROUTER_MODEL'),
    dailyLimit: Number(env('NARAROUTER_DAILY_RUNS') || 0),
    note: 'Included with the app, no key needed. Runs free models through NaraRouter, which tries each model in its combo in turn until one answers. Shared and rate-limited by everyone using this app, so runs can be slow or paused at busy times; adding your own key avoids that. Model providers may log prompts, which here include your resume.',
  },
];
export const INCLUDED_ID = INCLUDED[0].id;

/** Whether the app offers any free AI without a key of the user's own. */
export const hasIncluded = () => INCLUDED.some((i) => i.key);

// Describe a key that doesn't have the expected shape, without revealing it, so a bad paste (quotes, "Bearer ",
// a line break, the variable name, another secret) shows up in the logs.
const SHAPES: Record<string, { env: string; label: string; prefix: string; re: RegExp }> = {
  'included-free': { env: 'OPENROUTER_API_KEY', label: 'an OpenRouter key', prefix: 'sk-or-', re: /^sk-or-v1-[0-9a-f]{64}$/ },
  'included-nara': { env: 'NARAROUTER_API_KEY', label: 'a NaraRouter key', prefix: 'sk-nry-', re: /^sk-nry-[A-Za-z0-9_-]{16,}$/ },
};
for (const i of INCLUDED) {
  const shape = SHAPES[i.id];
  const k = i.key;
  if (!k || shape.re.test(k)) continue;
  console.warn(
    `[providers] ${shape.env} doesn't look like ${shape.label}: ${k.length} characters, starts "${k.slice(0, 7).replace(/[A-Za-z0-9]/g, (c) => (k.startsWith(shape.prefix) ? c : '•'))}", ` +
      `whitespace inside: ${/\s/.test(k)}, quotes: ${/["']/.test(k)}, "=" inside: ${k.includes('=')}, "Bearer": ${/bearer/i.test(k)}`,
  );
}
if (env('NARAROUTER_API_KEY') && !env('NARAROUTER_MODEL'))
  console.warn('[providers] NARAROUTER_API_KEY is set but NARAROUTER_MODEL is not: set it to a combo such as combo/free-pack');

function includedSource(i: Included): ProviderConfig {
  return {
    id: i.id,
    kind: i.kind,
    name: i.name,
    baseUrl: PRESETS[i.kind].baseUrl,
    apiKey: '',
    saveKey: false,
    model: i.model,
    enabled: true,
    fallbackOnly: true,
    weight: 1,
    dailyLimit: i.dailyLimit,
    maxTokens: 8192,
    builtin: true,
  };
}

/** Adds each included source the server has a key for; hides the ones it doesn't. */
function withIncluded(s: Settings): Settings {
  // in reverse, so they end up in INCLUDED order at the front: tried before a paid fallback such as the Claude plan
  for (const inc of [...INCLUDED].reverse()) {
    const i = s.providers.findIndex((p) => p.id === inc.id);
    if (!inc.key) {
      if (i >= 0) s.providers.splice(i, 1);
      continue;
    }
    if (i < 0) s.providers.unshift(includedSource(inc));
    else s.providers[i] = { ...includedSource(inc), ...s.providers[i], apiKey: '', saveKey: false, builtin: true };
  }
  return s;
}

function load(userId: string): Settings {
  const raw = storage.readText(userKey(FILE, userId));
  if (!raw) return withIncluded(defaults());
  const s: Settings = { ...defaults(), ...JSON.parse(raw) };
  // sources from before BYOK: a key already on disk was saved on purpose
  for (const p of s.providers) p.saveKey ??= !!p.apiKey;
  return withIncluded(s);
}

/** Each user's AI settings, loaded on first use. */
const all = new Map<string, Settings>();

/** The signed-in user's AI settings. */
function S(): Settings {
  const id = currentUserId();
  let s = all.get(id);
  if (!s) all.set(id, (s = load(id)));
  return s;
}

/** Drop cached settings so they're re-read from storage (after data is moved into an account). */
export function forget(userId: string) {
  all.delete(userId);
}

function persist() {
  storage.writeText(userKey(FILE), JSON.stringify(S(), null, 2));
}

function usage(id: string): ProviderUsage {
  let u = S().usage[id];
  if (!u) u = S().usage[id] = { day: today(), runs: 0, requests: 0, promptTokens: 0, completionTokens: 0, failures: 0, totalRuns: 0 };
  if (u.day !== today()) Object.assign(u, { day: today(), runs: 0, requests: 0, promptTokens: 0, completionTokens: 0, failures: 0 });
  return u;
}

// ---------------------------------------------------------------- session-only keys (BYOK)

/** How long a tab's keys survive without a heartbeat. Covers background-tab timer throttling. */
const SESSION_TTL = 3 * 60_000;
/** After the tab says it is closing: long enough for a reload to check back in. */
const CLOSE_GRACE = 15_000;

/** Browser-tab sessions. Each belongs to the user signed in on that tab; keys are only ever used for that user. */
const sessions = new Map<string, { userId?: string; expires: number; keys: Map<string, string> }>();

export const validSessionId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(id);

function sweep() {
  const t = Date.now();
  for (const [id, s] of sessions) if (s.expires <= t) sessions.delete(id);
}
setInterval(sweep, 15_000).unref();

/** The tab is still open. Creates the session on first contact. */
export function touchSession(sid: string) {
  const userId = maybeUserId();
  const s = sessions.get(sid);
  // a different user signed in on this tab: start clean so the previous user's keys can't carry over
  if (s && s.userId === userId) s.expires = Date.now() + SESSION_TTL;
  else sessions.set(sid, { userId, expires: Date.now() + SESSION_TTL, keys: new Map() });
}

/** Signing out: forget every key entered in this tab. */
export function dropSession(sid: string) {
  sessions.delete(sid);
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
  const userId = currentUserId();
  for (const s of sessions.values()) {
    if (s.userId !== userId) continue;
    const k = s.keys.get(providerId);
    if (k) return k;
  }
  return '';
}

function dropSessionKeys(providerId: string) {
  const userId = currentUserId();
  for (const s of sessions.values()) if (s.userId === userId) s.keys.delete(providerId);
}

/** The key in effect for a source: the saved one, else one entered in an open browser tab. */
export function keyFor(p: Pick<ProviderConfig, 'apiKey'> & { id?: string; builtin?: boolean }): string {
  const inc = INCLUDED.find((i) => i.id === p.id);
  if (inc) return inc.key;
  if (p.builtin) return '';
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
  const p = S().providers.find((x) => x.id === id);
  if (!p) throw new Error('Source not found');
  if (p.builtin) throw new Error('The included source has no key of yours to forget');
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
  if (kind === 'claude' && !claudeAllowed) throw new Error('The Claude plan source only works when the app runs on your own computer');
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
  S().providers.push(p);
  persist();
  return p;
}

export function updateProvider(id: string, patch: Partial<ProviderConfig>, sid?: string): ProviderConfig {
  const i = S().providers.findIndex((p) => p.id === id);
  if (i < 0) throw new Error('Source not found');
  const prevKey = S().providers[i].apiKey;
  if (S().providers[i].builtin) {
    // the app's key and endpoint aren't the user's to change
    const { apiKey, saveKey, baseUrl, ...rest } = patch;
    patch = rest;
  }
  S().providers[i] = sanitize({ ...patch, kind: S().providers[i].kind }, S().providers[i]);
  // only touch keys when the patch is about keys (toggling "enabled" must not move a key around)
  if (patch.apiKey || patch.saveKey !== undefined) applyKey(S().providers[i], patch, prevKey, sid);
  // config changed — give it a fresh chance
  delete usage(id).cooldownUntil;
  persist();
  return S().providers[i];
}

export function removeProvider(id: string) {
  if (getProvider(id)?.builtin) throw new Error('The included source can be turned off but not removed');
  S().providers = S().providers.filter((p) => p.id !== id);
  delete S().usage[id];
  dropSessionKeys(id);
  persist();
}

export function reorder(ids: string[]) {
  const pos = new Map(ids.map((id, i) => [id, i]));
  S().providers.sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
  persist();
}

export function setStrategy(s: Strategy) {
  if (s !== 'balanced' && s !== 'priority') throw new Error('bad strategy');
  S().strategy = s;
  persist();
}

export function getProvider(id: string) {
  return S().providers.find((p) => p.id === id);
}

/** What the browser sees: keys masked, plus today's usage and current availability. */
export function publicSettings() {
  return {
    strategy: S().strategy,
    presets: PRESETS,
    claudeAllowed,
    providers: S().providers.map((p) => {
      const { apiKey, ...rest } = p;
      const key = keyFor(p);
      return {
        ...rest,
        builtin: !!p.builtin,
        note: p.builtin ? INCLUDED.find((i) => i.id === p.id)?.note : undefined,
        apiKeySet: !!key,
        keySaved: !!apiKey,
        keyInSession: !apiKey && !!key && !p.builtin,
        // never hint at the app's own key
        apiKeyHint: key && !p.builtin ? `…${key.slice(-4)}` : '',
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
  const live = S().providers.filter((p) => availability(p).ok);
  const primary = live.filter((p) => !p.fallbackOnly);
  if (S().strategy === 'balanced') {
    const load = (p: ProviderConfig) => usage(p.id).runs / p.weight;
    primary.sort((a, b) => load(a) - load(b) || (usage(a.id).lastUsed ?? '').localeCompare(usage(b.id).lastUsed ?? ''));
  }
  return [...primary, ...live.filter((p) => p.fallbackOnly)];
}

export function whyNothingAvailable(): string {
  const reasons = S().providers.map((p) => `${p.name}: ${(availability(p) as { reason: string }).reason}`);
  return `No AI source is available${reasons.length ? ` (${reasons.join('; ')})` : ''}. Add or enable one on the Settings page.`;
}

/** Called when a source is picked, so concurrent runs spread out before any of them finish. */
export function beginRun(id: string) {
  const u = usage(id);
  logUsage({ runs: 1 });
  u.runs++;
  u.totalRuns++;
  u.lastUsed = now();
  persist();
}

/** One request to a source. `estimate` is used for the usage history when the source reported no token counts. */
export function recordRequest(id: string, tokens?: { prompt?: number; completion?: number }, estimate?: { prompt: number; completion: number }) {
  const u = usage(id);
  u.requests++;
  u.promptTokens += tokens?.prompt ?? 0;
  u.completionTokens += tokens?.completion ?? 0;
  const reported = tokens?.prompt != null || tokens?.completion != null;
  logUsage({
    requests: 1,
    promptTokens: reported ? (tokens?.prompt ?? 0) : (estimate?.prompt ?? 0),
    completionTokens: reported ? (tokens?.completion ?? 0) : (estimate?.completion ?? 0),
    estimatedRequests: reported ? 0 : 1,
  });
  persist();
}

export function recordSuccess(id: string) {
  const u = usage(id);
  delete u.cooldownUntil;
  persist();
}

export function recordFailure(id: string, message: string, cooldownMs: number) {
  const u = usage(id);
  logUsage({ failures: 1 });
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
  const primary = S().providers.filter((p) => !p.fallbackOnly && availability(p).ok);
  if (primary.length === 1) return `${primary[0].name} · ${primary[0].model}`;
  if (primary.length > 1) return `${primary.length} free sources · ${S().strategy}`;
  const any = routeOrder()[0];
  return any ? `${any.name} · ${any.model}` : 'no AI source';
}
