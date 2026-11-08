import type { Keyword } from './types.ts';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex matching a keyword as a whole term (tolerates plural "s" and hyphen/space variants). */
export function termRegex(term: string): RegExp {
  const body = esc(term.trim()).replace(/\\-|\s+/g, '[\\s-]?');
  const pre = /^\w/.test(term) ? '\\b' : '';
  const post = /\w$/.test(term) ? '(?:s|es)?\\b' : '';
  return new RegExp(`${pre}${body}${post}`, 'i');
}

const WEIGHT = { high: 3, medium: 2, low: 1 } as const;

/** Deterministic ATS-style coverage: weighted share of JD keywords literally present in the resume. */
export function keywordCoverage(keywords: Keyword[], resume: string) {
  const matched: string[] = [];
  const missing: string[] = [];
  let got = 0;
  let total = 0;
  for (const k of keywords) {
    const w = WEIGHT[k.importance] ?? 1;
    total += w;
    if (termRegex(k.term).test(resume)) {
      matched.push(k.term);
      got += w;
    } else missing.push(k.term);
  }
  return { coverage: total ? Math.round((got / total) * 100) : 0, matched, missing };
}
