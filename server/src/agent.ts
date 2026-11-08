import { createSdkMcpServer, query, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { ROOT } from './store.ts';
import { pushEvent } from './tasks.ts';
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
}

/** Pick sources from the router and fail over between them until one completes the run. */
export async function runAgent(o: RunOptions): Promise<{ sessionId?: string; result: string }> {
  await Promise.resolve(); // let callers subscribe to the task's events before the first one is pushed
  // A chat started on Claude can only be resumed by Claude, and one started on a free model only by free models.
  const ownSession = oa.hasSession(o.resume);
  const claudeSession = !!o.resume && !ownSession;
  let order = providers.routeOrder();
  if (claudeSession && order.some((p) => p.kind === 'claude')) order = order.filter((p) => p.kind === 'claude');
  if (!order.length) throw new Error(providers.whyNothingAvailable());

  // Workflows hand the agent exactly one save tool; the run is only done once it has been called.
  const mustCall = o.tools.length === 1 ? o.tools[0].name : undefined;
  const builtins = [...(o.web ? [webFetch, webSearch] : []), ...(o.skills ? [skillTool] : [])];
  const state = oa.newState(o.system, ownSession ? oa.getSession(o.resume!) : [], o.prompt);
  const errors: string[] = [];

  for (const p of order) {
    providers.beginRun(p.id);
    pushEvent(o.task, { type: 'status', text: `Using ${p.name} · ${p.model}` });
    try {
      let out: { sessionId?: string; result: string };
      if (p.kind === 'claude') out = await runClaude(o, p, claudeSession ? o.resume : undefined);
      else {
        const result = await oa.runLoop(p, state, {
          tools: [...o.tools, ...builtins],
          maxTurns: o.maxTurns ?? 25,
          mustCall,
          onText: (text) => pushEvent(o.task, { type: 'text', text }),
          onTool: (name, input) => pushEvent(o.task, { type: 'tool', tool: name, text: describeTool(name, input) }),
        });
        out = { result, sessionId: oa.saveSession(ownSession ? o.resume : undefined, state) };
      }
      providers.recordSuccess(p.id);
      return out;
    } catch (e: any) {
      const cooldown = e instanceof oa.ProviderError ? e.cooldownMs : 0;
      providers.recordFailure(p.id, e.message, cooldown);
      errors.push(`${p.name}: ${e.message}`);
      console.error(`[agent] ${p.name} (${p.model}) failed:`, e.message);
      if (p !== order[order.length - 1]) pushEvent(o.task, { type: 'status', text: `${p.name} failed (${e.message.slice(0, 140)}). Switching source…` });
    }
  }
  throw new Error(errors.length > 1 ? `All AI sources failed — ${errors.join(' | ')}` : errors[0]);
}

async function runClaude(o: RunOptions, p: ProviderConfig, resume?: string): Promise<{ sessionId?: string; result: string }> {
  const server = createSdkMcpServer({ name: 'agency', version: '1.0.0', tools: o.tools, alwaysLoad: true });
  const builtins = [...(o.web ? ['WebFetch', 'WebSearch'] : []), ...(o.skills ? ['Skill'] : [])];
  const allowed = [...o.tools.map((t) => `mcp__agency__${t.name}`), ...builtins];

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
      if (!m.parent_tool_use_id && ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        pushEvent(o.task, { type: 'text', text: ev.delta.text });
      }
    } else if (m.type === 'assistant') {
      for (const block of m.message.content as any[]) {
        if (block.type === 'tool_use') pushEvent(o.task, { type: 'tool', tool: block.name, text: describeTool(block.name, block.input) });
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
