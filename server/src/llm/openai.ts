import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import * as providers from './providers.ts';
import type { ProviderConfig } from './providers.ts';

/** Agent loop for any OpenAI-compatible /chat/completions endpoint (OpenRouter, HF router, Gemini, LM Studio, …). */

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** Failure attributable to the source (not to our tools); `cooldownMs` pauses it in the router. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public cooldownMs: number,
  ) {
    const tooLong = /context length|context window|maximum context|too many tokens|tokens to keep/i.test(message);
    super(tooLong ? `${message} — the prompt is larger than this model's context window; use a model (or LM Studio load setting) with at least 32k context` : message);
  }
}

const MIN = 60_000;

function classify(status: number, body: string, retryAfter: string | null): ProviderError {
  const msg = `HTTP ${status}: ${extractError(body)}`;
  if (status === 429) {
    const secs = Number(retryAfter);
    // daily/quota exhaustion: back off for longer than a per-minute limit
    const daily = /per[- ]day|daily|quota|credits|exceeded your/i.test(body);
    return new ProviderError(msg, Number.isFinite(secs) && secs > 0 ? secs * 1000 : daily ? 60 * MIN : 2 * MIN);
  }
  if (status === 401 || status === 403) return new ProviderError(msg, 60 * MIN);
  if (status === 402) return new ProviderError(msg, 6 * 60 * MIN);
  if (status === 404 || status === 400 || status === 422) return new ProviderError(msg, 15 * MIN);
  return new ProviderError(msg, 2 * MIN);
}

function extractError(body: string): string {
  try {
    const j = JSON.parse(body);
    const e = Array.isArray(j) ? j[0]?.error : j.error;
    const m = typeof e === 'string' ? e : e?.message || j.message;
    const raw = e?.metadata?.raw;
    return String(m || body).slice(0, 300) + (raw ? ` (${String(raw).slice(0, 200)})` : '');
  } catch {
    return body.slice(0, 300) || 'no response body';
  }
}

function headers(p: ProviderConfig): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (p.apiKey) h.authorization = `Bearer ${p.apiKey}`;
  if (p.kind === 'openrouter') {
    h['HTTP-Referer'] = 'http://localhost:5173';
    h['X-Title'] = 'Job Hunt Agency';
  }
  return h;
}

// ---------------------------------------------------------------- tool schemas

/** JSON Schema without keywords that some providers (notably Gemini) reject. */
function cleanSchema(s: any): any {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (!s || typeof s !== 'object') return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === '$schema' || k === 'additionalProperties' || k === 'format' || k === '$id') continue;
    out[k] = cleanSchema(v);
  }
  return out;
}

function toolSpec(t: SdkMcpToolDefinition<any>) {
  return {
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: cleanSchema(z.toJSONSchema(z.object(t.inputSchema))) },
  };
}

// ---------------------------------------------------------------- one completion (streamed)

const stripThink = (s: string) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart();

export async function complete(
  p: ProviderConfig,
  body: { messages: ChatMsg[]; tools?: ReturnType<typeof toolSpec>[]; max_tokens?: number },
  onText?: (delta: string) => void,
): Promise<{ message: ChatMsg; finish?: string }> {
  let res: Response;
  try {
    res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: headers(p),
      body: JSON.stringify({
        model: p.model,
        stream: true,
        // LM Studio / OpenRouter only report token usage on streams when asked
        ...(p.kind === 'lmstudio' || p.kind === 'openrouter' ? { stream_options: { include_usage: true } } : {}),
        ...body,
        ...(body.tools?.length ? { tool_choice: 'auto' } : {}),
        ...(p.maxTokens ? { max_tokens: body.max_tokens ?? p.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(5 * MIN),
    });
  } catch (e: any) {
    const local = p.kind === 'lmstudio' || /localhost|127\.0\.0\.1|192\.168\./.test(p.baseUrl);
    throw new ProviderError(`Could not reach ${p.baseUrl} (${e.cause?.code ?? e.message})${local ? ' — is the server running?' : ''}`, 2 * MIN);
  }
  if (!res.ok) throw classify(res.status, await res.text(), res.headers.get('retry-after'));

  let content = '';
  let emitted = 0;
  let finish: string | undefined;
  let usage: any;
  const calls: { id?: string; name: string; args: string }[] = [];

  const absorb = (chunk: any) => {
    if (chunk.error) throw new ProviderError(`Stream error: ${extractError(JSON.stringify(chunk))}`, 2 * MIN);
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const d = choice.delta ?? choice.message ?? {};
    if (typeof d.content === 'string' && d.content) {
      content += d.content;
      const visible = stripThink(content);
      if (visible.length > emitted) {
        onText?.(visible.slice(emitted));
        emitted = visible.length;
      }
    }
    for (const [n, tc] of (d.tool_calls ?? []).entries()) {
      const i = tc.index ?? n;
      calls[i] ??= { name: '', args: '' };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].name += tc.function.name;
      if (tc.function?.arguments) calls[i].args += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
  };

  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    // server ignored stream:true
    absorb(await res.json());
  } else {
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          absorb(JSON.parse(data));
        } catch (e) {
          if (e instanceof ProviderError) throw e;
        }
      }
    }
  }

  providers.recordRequest(p.id, { prompt: usage?.prompt_tokens, completion: usage?.completion_tokens });
  const tool_calls = calls.filter((c) => c?.name).map((c) => ({ id: c.id || `call_${nanoid(8)}`, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } }));
  return { message: { role: 'assistant', content: stripThink(content) || null, ...(tool_calls.length ? { tool_calls } : {}) }, finish };
}

// ---------------------------------------------------------------- lenient parsing for weaker free models

function parseArgs(s: string): any {
  const t = s.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(t || '{}');
  } catch {
    // trailing commas are the most common slip
    return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
  }
}

/** Some models write the call as text (<tool_call>{…}</tool_call> or a JSON block) instead of using tool_calls. */
function toolCallsFromText(content: string, names: Set<string>): ToolCall[] {
  const blocks = [...content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)].map((m) => m[1]);
  if (!blocks.length) blocks.push(...[...content.matchAll(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g)].map((m) => m[1]));
  const out: ToolCall[] = [];
  for (const b of blocks) {
    try {
      const j = parseArgs(b);
      const name = j.name ?? j.function?.name;
      const args = j.arguments ?? j.parameters ?? j.function?.arguments ?? {};
      if (names.has(name)) out.push({ id: `call_${nanoid(8)}`, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
    } catch {
      /* not a tool call */
    }
  }
  return out;
}

// ---------------------------------------------------------------- agent loop

export interface LoopState {
  messages: ChatMsg[];
  turns: number;
  called: Set<string>;
}

export interface LoopOptions {
  tools: SdkMcpToolDefinition<any>[];
  maxTurns: number;
  /** For workflows: the save tool the run exists to call. The loop nudges until it is called, then stops. */
  mustCall?: string;
  onText: (t: string) => void;
  onTool: (name: string, input: any) => void;
}

export function newState(system: string, history: ChatMsg[], prompt: string): LoopState {
  return { messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: prompt }], turns: 0, called: new Set() };
}

const textOf = (r: any) => (r?.content ?? []).map((c: any) => c.text ?? '').join('\n') || '(no output)';

/** Runs until the model answers without tool calls. Mutates `state`, so a failed source can be swapped mid-run. */
export async function runLoop(p: ProviderConfig, state: LoopState, o: LoopOptions): Promise<string> {
  const specs = o.tools.map(toolSpec);
  const byName = new Map(o.tools.map((t) => [t.name, t]));
  const names = new Set(byName.keys());
  let nudges = 0;

  while (state.turns < o.maxTurns) {
    state.turns++;
    const { message, finish } = await complete(p, { messages: state.messages, tools: specs }, o.onText);
    let calls = message.tool_calls ?? [];
    if (!calls.length && message.content) {
      calls = toolCallsFromText(message.content, names);
      if (calls.length) message.content = null;
    }

    if (!calls.length) {
      if (o.mustCall && !state.called.has(o.mustCall)) {
        if (nudges >= 2) throw new ProviderError(`${p.model} did not call ${o.mustCall}${finish === 'length' ? ' (output was cut off — raise max output tokens)' : ''}`, 10 * MIN);
        nudges++;
        if (message.content) state.messages.push({ role: 'assistant', content: message.content });
        state.messages.push({
          role: 'user',
          content: `You have not called ${o.mustCall} yet. Call the ${o.mustCall} tool now with the complete data — do not reply with plain text.`,
        });
        continue;
      }
      if (!message.content) throw new ProviderError(`${p.model} returned an empty reply`, 5 * MIN);
      state.messages.push(message);
      return message.content;
    }

    state.messages.push({ role: 'assistant', content: message.content, tool_calls: calls });
    for (const call of calls) {
      const t = byName.get(call.function.name);
      let reply: string;
      if (!t) reply = `ERROR: unknown tool ${call.function.name}. Available: ${[...names].join(', ')}`;
      else {
        let args: any;
        try {
          args = parseArgs(call.function.arguments);
        } catch {
          args = undefined;
        }
        o.onTool(t.name, args);
        const parsed = args === undefined ? null : z.object(t.inputSchema).safeParse(args);
        if (!parsed) reply = 'ERROR: arguments were not valid JSON. Call the tool again with a valid JSON object.';
        else if (!parsed.success)
          reply = `ERROR: invalid arguments — ${parsed.error.issues
            .slice(0, 8)
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ')}. Fix them and call ${t.name} again.`;
        else {
          try {
            const r = await t.handler(parsed.data, {});
            reply = textOf(r);
            if (!r.isError) state.called.add(t.name);
          } catch (e: any) {
            reply = `ERROR: ${e.message}`;
          }
        }
      }
      state.messages.push({ role: 'tool', tool_call_id: call.id, content: reply });
    }

    if (o.mustCall && state.called.has(o.mustCall)) return message.content ?? 'Saved.';
  }
  throw new Error(`Agent stopped: reached ${o.maxTurns} turns`);
}

// ---------------------------------------------------------------- chat sessions (Claude keeps its own; these are ours)

const sessions = new Map<string, ChatMsg[]>();

export const hasSession = (id?: string) => !!id && sessions.has(id);
export const getSession = (id: string) => sessions.get(id) ?? [];

export function saveSession(id: string | undefined, state: LoopState): string {
  const sid = id && sessions.has(id) ? id : `oa_${nanoid(12)}`;
  sessions.set(sid, state.messages.slice(1)); // drop system; it's rebuilt per turn
  if (sessions.size > 40) sessions.delete(sessions.keys().next().value!);
  return sid;
}

// ---------------------------------------------------------------- settings-page helpers

export async function listModels(p: Pick<ProviderConfig, 'kind' | 'baseUrl' | 'apiKey'>): Promise<{ id: string; tools?: boolean; context?: number; free?: boolean }[]> {
  if (!p.baseUrl) throw new Error('Set the base URL first');
  if (p.kind === 'lmstudio') {
    const r = await fetch(p.baseUrl.replace(/\/v1$/, '/api/v0/models'), { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (r?.ok) {
      const rows: any[] = ((await r.json()) as any).data ?? [];
      return rows
        .filter((m) => m.type !== 'embeddings')
        .map((m) => ({ id: m.id, tools: (m.capabilities ?? []).includes('tool_use'), context: m.loaded_context_length ?? m.max_context_length }))
        .sort((a, b) => Number(b.tools) - Number(a.tools) || a.id.localeCompare(b.id));
    }
  }
  const res = await fetch(`${p.baseUrl}/models`, { headers: headers(p as ProviderConfig), signal: AbortSignal.timeout(20_000) }).catch((e) => {
    throw new Error(`Could not reach ${p.baseUrl}: ${e.cause?.code ?? e.message}`);
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${extractError(await res.text())}`);
  const j: any = await res.json();
  const rows: any[] = j.data ?? j.models ?? [];
  let models = rows.map((m) => ({
    id: String(m.id ?? m.name ?? '').replace(/^models\//, ''),
    tools: Array.isArray(m.supported_parameters) ? m.supported_parameters.includes('tools') : undefined,
    context: m.context_length ?? m.inputTokenLimit ?? undefined,
    free: m.pricing ? Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0 : undefined,
  }));
  if (p.kind === 'openrouter') models = models.filter((m) => m.free || m.id.endsWith(':free'));
  if (p.kind === 'google') models = models.filter((m) => /gemini|gemma/.test(m.id) && !/embedding|image|tts|audio|live/.test(m.id));
  return models.filter((m) => m.id).sort((a, b) => Number(b.tools ?? 0) - Number(a.tools ?? 0) || a.id.localeCompare(b.id));
}

/** Small round trip that checks the source answers and can call a tool. */
export async function testProvider(p: ProviderConfig) {
  const started = Date.now();
  const ping = {
    type: 'function' as const,
    function: {
      name: 'record_answer',
      description: 'Record the answer to the question.',
      parameters: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] },
    },
  };
  try {
    const { message } = await complete(
      { ...p, maxTokens: 300 },
      {
        messages: [
          { role: 'system', content: 'You must answer by calling the record_answer tool.' },
          { role: 'user', content: 'What is the capital of France? Answer with the record_answer tool.' },
        ],
        tools: [ping],
      },
    );
    const calls = message.tool_calls?.length ? message.tool_calls : toolCallsFromText(message.content ?? '', new Set(['record_answer']));
    const toolCalling = calls.some((c) => c.function.name === 'record_answer');
    if (toolCalling) providers.clearCooldown(p.id);
    return {
      ok: true,
      toolCalling,
      latencyMs: Date.now() - started,
      reply: toolCalling ? `record_answer(${calls[0].function.arguments})` : (message.content ?? '').slice(0, 300),
    };
  } catch (e: any) {
    return { ok: false, toolCalling: false, latencyMs: Date.now() - started, error: e.message };
  }
}
