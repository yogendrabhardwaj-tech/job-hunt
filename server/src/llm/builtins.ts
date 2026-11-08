import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ROOT } from '../store.ts';
import { UA, htmlToText } from '../extract.ts';

/**
 * Stand-ins for Claude Code's built-in WebFetch / WebSearch / Skill tools, used when a run goes to an
 * OpenAI-compatible model. Same names, so the workflow prompts work unchanged on either path.
 */

const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const MAX_PAGE = 20_000;

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const fail = (msg: string) => ({ content: [{ type: 'text' as const, text: `ERROR: ${msg}` }], isError: true });

function readSkill(name: string) {
  const p = path.join(SKILLS_DIR, name, 'SKILL.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/^---[\s\S]*?---\s*/, '') : '';
}

/** Load a resumeskills SKILL.md (frontmatter stripped) to inline into a workflow's system prompt. */
export function skill(name: string): string {
  const body = readSkill(name);
  return body ? `<playbook name="${name}">\n${body}\n</playbook>` : '';
}

const skillNames = fs.existsSync(SKILLS_DIR)
  ? fs.readdirSync(SKILLS_DIR).filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md')))
  : [];

export const skillTool = tool(
  'Skill',
  'Load one of the resume playbooks (step-by-step expert instructions) before doing substantive work of that kind.',
  { skill: z.enum(skillNames.length ? (skillNames as [string, ...string[]]) : ['none']) },
  async ({ skill: name }) => (readSkill(name) ? ok(readSkill(name)) : fail(`No playbook ${name}`)),
);

export const webFetch = tool(
  'WebFetch',
  `Fetch a web page and return its readable text (first ${MAX_PAGE.toLocaleString()} characters). Pages that need JavaScript or a login may come back empty.`,
  { url: z.string().describe('Full http(s) URL'), prompt: z.string().optional().describe('What you are looking for on the page') },
  async ({ url }) => {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(25_000) });
      if (!res.ok) return fail(`HTTP ${res.status} from ${url}`);
      const type = res.headers.get('content-type') ?? '';
      const raw = await res.text();
      let text = raw;
      if (type.includes('html')) {
        const $ = cheerio.load(raw);
        $('script,style,noscript,svg,nav,footer,header,iframe').remove();
        text = htmlToText($.html());
      }
      text = text.trim();
      if (!text) return fail('The page had no readable text (it probably needs JavaScript or a login)');
      return ok(text.length > MAX_PAGE ? `${text.slice(0, MAX_PAGE)}\n\n[truncated]` : text);
    } catch (e: any) {
      return fail(`Could not fetch ${url}: ${e.message}`);
    }
  },
);

/** Best-effort keyless search via DuckDuckGo's HTML endpoint. */
export const webSearch = tool(
  'WebSearch',
  'Search the web. Returns up to 8 results with title, URL and snippet.',
  { query: z.string() },
  async ({ query }) => {
    try {
      const res = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ q: query }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return fail(`Search failed (HTTP ${res.status})`);
      const $ = cheerio.load(await res.text());
      const results = $('.result')
        .toArray()
        .map((el) => {
          const a = $(el).find('a.result__a');
          let href = a.attr('href') ?? '';
          const uddg = href.match(/[?&]uddg=([^&]+)/);
          if (uddg) href = decodeURIComponent(uddg[1]);
          return { title: a.text().trim(), url: href, snippet: $(el).find('.result__snippet').text().trim() };
        })
        .filter((r) => r.title && r.url.startsWith('http'))
        .slice(0, 8);
      if (!results.length) return fail('No results (search may be temporarily unavailable). Continue without it.');
      return ok(results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n'));
    } catch (e: any) {
      return fail(`Search unavailable: ${e.message}. Continue without it.`);
    }
  },
);
