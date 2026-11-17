import { createSdkMcpServer, query, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { ROOT } from './store.ts';
import * as store from './store.ts';
import { cancelReason, pushEvent } from './tasks.ts';
import { currentUserId } from './context.ts';
import * as consent from './privacy/consent.ts';
import { codecFor, streamRestorer, type Codec } from './privacy/redact.ts';
import * as providers from './llm/providers.ts';
import type { ProviderConfig } from './llm/providers.ts';
import * as oa from './llm/openai.ts';
import { skillTool, webFetch, webSearch } from './llm/builtins.ts';
import type { Task } from './types.ts';

export { skill } from './llm/builtins.ts';

const EFFORT = (process.env.AGENT_EFFORT || 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const RESUME_FORMAT = `Resume Markdown format (always use exactly this structure so the app can render it):
# Full Name
email · phone · location · LinkedIn URL   (one line, only fields that are known)

## Summary
2–4 sentence professional summary.

## Skills
- **Category:** skill, skill, skill

## Experience
### Job Title — Company
*Mon YYYY – Mon YYYY · City*
- Achievement bullet (action verb + what + measurable result)

## Education
### Degree — School
*YYYY*

(Optional sections: ## Certifications, ## Projects, ## Awards — same pattern.)
No tables, no images, no HTML. ATS-safe plain Markdown only.`;

const TOOL_LABELS: Record<string, string> = {
  get_profile: 'Reading your profile & master resume',
  list_jobs: 'Reviewing your applications',
  get_job: 'Opening job record',
  read_resume: 'Reading resume version',
  save_job_details: 'Saving structured job details',
  save_match_analysis: 'Saving match analysis',
  save_tailored_resume: 'Writing tailored resume',
  save_master_resume: 'Saving master resume',
  update_profile: 'Updating your profile',
  save_document: 'Saving document',
  update_job_status: 'Updating application status',
  add_note: 'Adding note',
  create_job_from_url: 'Creating new job record',
  start_workflow: 'Starting workflow',
  WebFetch: 'Fetching web page',
  WebSearch: 'Searching the web',
  Skill: 'Loading playbook',
};

function describeTool(name: string, input: any): string {
  const short = name.replace(/^mcp__agency__/, '');
  let label = TOOL_LABELS[short] ?? short;
  if (short === 'Skill' && input?.skill) label += `: ${input.skill}`;
  if ((short === 'WebFetch' || short === 'create_job_from_url') && input?.url) label += ` — ${input.url}`;
  if (short === 'WebSearch' && input?.query) label += ` — “${input.query}”`;
  if (input?.jobId) label += ` (${input.jobId})`;
  if (short === 'start_workflow' && input?.workflow) label = `Starting ${input.workflow} workflow (${input.jobId})`;
  return label;
}

export interface RunOptions {
  task: Task;
  system: string;
  prompt: string;
  tools: SdkMcpToolDefinition<any>[];
  web?: boolean;
  skills?: boolean;
  resume?: string;
  maxTurns?: number;
  /** Run on this source only (picked in the copilot), with no failover to others. */
  sourceId?: string;
}

const PLACEHOLDERS = `Privacy placeholders: the candidate's name and contact details appear as placeholders such as [[NAME]], [[EMAIL]],
[[PHONE]], [[LOCATION]], [[LINKEDIN]] or [[EMAIL_3f2a1c]]. Copy them exactly, brackets included, wherever the real value belongs
(for example the resume heading "# [[NAME]]" and the contact line). Never guess, expand or remove them; the app fills in the
real values. Never put a placeholder in a web search or a URL.`;

/** A run stopped from outside: consent withdrawn mid-run, or the user's data being deleted. */
export class CancelledError extends Error {}

const failText = (msg: string) => ({ content: [{ type: 'text' as const, text: `ERROR: ${msg}` }], isError: true });

/**
 * The model only ever sees placeholders for contact details; our tools get the real values back before they write
 * anything, and what they return is redacted again. Nothing is written once the run has been cancelled.
 */
function guardTool(t: SdkMcpToolDefinition<any>, codec: Codec, task: Task): SdkMcpToolDefinition<any> {
  return {
    ...t,
    handler: async (args: any, extra: unknown) => {
      const why = cancelReason(task);
      if (why) return failText(why);
      return codec.redactDeep(await t.handler(codec.restoreDeep(args), extra));
    },
  };
}

/** Web tools get no real values back, and refuse anything carrying personal details (they'd leave our server). */
function guardWeb(t: SdkMcpToolDefinition<any>, codec: Codec): SdkMcpToolDefinition<any> {
  return {
    ...t,
    handler: async (args: any, extra: unknown) => {
      if (codec.sensitive(String(args?.query ?? '')) || codec.sensitive(String(args?.url ?? '')))
        return failText('Blocked: the request contained personal details. Search or fetch using only company, role and public page addresses.');
      return codec.redactDeep(await t.handler(args, extra));
    },
  };
}

/** Pick sources from the router and fail over between them until one completes the run. */
export async function runAgent(o: RunOptions): Promise<{ sessionId?: string; result: string }> {
  await Promise.resolve(); // let callers subscribe to the task's events before the first one is pushed
  const userId = currentUserId();
  const feature = consent.featureFor(o.task.kind);
  // No consent, no AI call (issue #20). Also re-checked before every model request below.
  const status = await consent.requireActiveFresh(userId, feature);
  const checkpoint = () => {
    const why = cancelReason(o.task);
    if (why) throw new CancelledError(why);
    consent.requireActive(userId, feature);
  };

  // A chat started on Claude can only be resumed by Claude, and one started on a free model only by free models.
  let ownSession = oa.hasSession(o.resume);
  let claudeSession = !!o.resume && !ownSession;
  let order: ProviderConfig[];
  if (o.sourceId) {
    const p = providers.getProvider(o.sourceId);
    if (!p) throw new Error('The AI model picked in the copilot no longer exists. Pick another one, or choose Auto.');
    const a = providers.availability(p);
    if (!a.ok) throw new Error(`${p.name} (${p.model}) isn't available: ${a.reason}. Pick another model in the copilot, or choose Auto.`);
    order = [p];
    // the picked source can't read a conversation kept by the other kind, so it starts a fresh one
    if ((p.kind === 'claude') !== claudeSession) ownSession = claudeSession = false;
  } else {
    order = providers.routeOrder();
    if (claudeSession && order.some((p) => p.kind === 'claude')) order = order.filter((p) => p.kind === 'claude');
  }
  if (!order.length) throw new Error(providers.whyNothingAvailable());
  // Failover stays inside what the user agreed to: a source the grant doesn't cover is never used.
  const covered = order.filter((p) => consent.covers(status.sources, p));
  if (!covered.length) throw new consent.ConsentRequiredError('sources_changed', feature ?? undefined);
  order = covered;

  const profile = store.getProfile();
  const codec = codecFor(profile, status.preferences, [store.readMaster(), profile.achievements, profile.linkedinText]);
  const prompt = codec.redact(o.prompt);
  const tools = o.tools.map((t) => guardTool(t, codec, o.task));
  const system = `${o.system}\n\n${PLACEHOLDERS}`;
  const run: RunOptions = { ...o, system, prompt, tools };
  const restorer = streamRestorer(codec);
  const onText = (text: string) => {
    const t = restorer.push(text);
    if (t) pushEvent(o.task, { type: 'text', text: t });
  };
  const flushText = () => {
    const t = restorer.flush();
    if (t) pushEvent(o.task, { type: 'text', text: t });
  };
  const onTool = (name: string, input: any) => pushEvent(o.task, { type: 'tool', tool: name, text: describeTool(name, codec.restoreDeep(input)) });

  // Workflows hand the agent exactly one save tool; the run is only done once it has been called.
  const mustCall = o.tools.length === 1 ? o.tools[0].name : undefined;
  const builtins = [...(o.web ? [guardWeb(webFetch, codec), guardWeb(webSearch, codec)] : []), ...(o.skills ? [skillTool] : [])];
  const state = oa.newState(system, ownSession ? oa.getSession(o.resume!) : [], prompt);
  const errors: string[] = [];

  for (const p of order) {
    checkpoint();
    providers.beginRun(p.id);
    pushEvent(o.task, { type: 'status', text: `Using ${p.name} · ${p.model}` });
    try {
      let out: { sessionId?: string; result: string };
      if (p.kind === 'claude') out = await runClaude(run, p, codec, { onText, onTool, checkpoint }, claudeSession ? o.resume : undefined);
      else {
        const result = await oa.runLoop(p, state, {
          tools: [...tools, ...builtins],
          maxTurns: o.maxTurns ?? 25,
          mustCall,
          onText,
          onTool,
          beforeRequest: checkpoint,
        });
        out = { result, sessionId: oa.saveSession(ownSession ? o.resume : undefined, state) };
      }
      flushText();
      providers.recordSuccess(p.id);
      return { ...out, result: codec.restore(out.result) };
    } catch (e: any) {
      flushText();
      // consent and cancellation stop the run; they must never be treated as a source failure and failed over
      if (e instanceof consent.ConsentRequiredError || e instanceof CancelledError) throw e;
      const message = codec.redact(String(e.message ?? e));
      const cooldown = e instanceof oa.ProviderError ? e.cooldownMs : 0;
      providers.recordFailure(p.id, message, cooldown);
      errors.push(`${p.name}: ${message}`);
      console.error(`[agent] ${p.name} (${p.model}) failed:`, message);
      if (p !== order[order.length - 1]) pushEvent(o.task, { type: 'status', text: `${p.name} failed (${message.slice(0, 140)}). Switching source…` });
    }
  }
  throw new Error(errors.length > 1 ? `All AI sources failed — ${errors.join(' | ')}` : errors[0]);
}

interface ClaudeHooks {
  onText: (t: string) => void;
  onTool: (name: string, input: any) => void;
  checkpoint: () => void;
}

async function runClaude(o: RunOptions, p: ProviderConfig, codec: Codec, h: ClaudeHooks, resume?: string): Promise<{ sessionId?: string; result: string }> {
  const server = createSdkMcpServer({ name: 'agency', version: '1.0.0', tools: o.tools, alwaysLoad: true });
  const builtins = [...(o.web ? ['WebFetch', 'WebSearch'] : []), ...(o.skills ? ['Skill'] : [])];
  const allowed = [...o.tools.map((t) => `mcp__agency__${t.name}`), ...builtins];
  const abort = new AbortController();

  // Claude's own WebSearch/WebFetch run outside our tools, so personal details are blocked with a hook instead.
  const blockPersonal = async (input: any) => {
    const ti = input?.tool_input ?? {};
    if (codec.sensitive(String(ti.query ?? '')) || codec.sensitive(String(ti.url ?? '')))
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse' as const,
          permissionDecision: 'deny' as const,
          permissionDecisionReason: 'Blocked: the request contained personal details. Use only company, role and public page addresses.',
        },
      };
    return {};
  };

  let sessionId: string | undefined;
  let result = '';
  const stream = query({
    prompt: o.prompt,
    options: {
      cwd: ROOT,
      model: p.model || 'claude-opus-5-5',
      effort: EFFORT,
      systemPrompt: o.system,
      tools: builtins,
      mcpServers: { agency: server },
      allowedTools: allowed,
      permissionMode: 'dontAsk',
      abortController: abort,
      hooks: { PreToolUse: [{ matcher: 'WebSearch|WebFetch', hooks: [blockPersonal] }] },
      // project settings expose .claude/skills (the resumeskills playbooks) to the Skill tool
      settingSources: o.skills ? ['project'] : [],
      ...(o.skills ? { skills: 'all' as const } : {}),
      includePartialMessages: true,
      maxTurns: o.maxTurns ?? 25,
      ...(resume ? { resume } : {}),
    },
  });

  for await (const m of stream) {
    if ('session_id' in m && m.session_id) sessionId = m.session_id;
    if (m.type === 'stream_event') {
      const ev: any = m.event;
      if (!m.parent_tool_use_id && ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') h.onText(ev.delta.text);
    } else if (m.type === 'assistant') {
      // between model turns: stop if consent was withdrawn or the task cancelled
      try {
        h.checkpoint();
      } catch (e) {
        abort.abort();
        throw e;
      }
      for (const block of m.message.content as any[]) {
        if (block.type === 'tool_use') h.onTool(block.name, block.input);
      }
      if (m.error) pushEvent(o.task, { type: 'error', text: `Model error: ${m.error}` });
    } else if (m.type === 'result') {
      providers.recordRequest(p.id, { prompt: m.usage?.input_tokens, completion: m.usage?.output_tokens });
      if (m.subtype === 'success') result = m.result;
      else throw new Error(`Agent stopped: ${m.subtype}${'errors' in m && m.errors?.length ? ' — ' + m.errors.join('; ') : ''}`);
    }
  }
  return { sessionId, result };
}
