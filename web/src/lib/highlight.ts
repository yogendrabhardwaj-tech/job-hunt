// Keyword highlighting shared by plain text (JD) and rendered Markdown (resume).
// Mirrors server/src/keywords.ts termRegex so highlights agree with the coverage score.

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Term {
  term: string;
  cls: 'kw-hit' | 'kw-miss';
}

function termPattern(term: string) {
  const body = esc(term.trim()).replace(/\\-|\s+/g, '[\\s-]?');
  const pre = /^\w/.test(term) ? '\\b' : '';
  const post = /\w$/.test(term) ? '(?:s|es)?\\b' : '';
  return `${pre}${body}${post}`;
}

export function buildMatcher(terms: Term[]) {
  const sorted = [...terms].filter((t) => t.term.trim()).sort((a, b) => b.term.length - a.term.length);
  if (!sorted.length) return null;
  const re = new RegExp(sorted.map((t) => `(${termPattern(t.term)})`).join('|'), 'gi');
  return { re, classes: sorted.map((t) => t.cls) };
}

export type Piece = { text: string; cls?: string };

export function splitText(text: string, m: ReturnType<typeof buildMatcher>): Piece[] {
  if (!m) return [{ text }];
  const out: Piece[] = [];
  let last = 0;
  m.re.lastIndex = 0;
  for (const hit of text.matchAll(m.re)) {
    const idx = hit.index!;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const g = hit.slice(1).findIndex((x) => x !== undefined);
    out.push({ text: hit[0], cls: m.classes[g] });
    last = idx + hit[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** rehype plugin: wraps keyword matches inside text nodes in <mark class="...">. */
export function rehypeKeywords(terms: Term[]) {
  const m = buildMatcher(terms);
  return () => (tree: any) => {
    if (!m) return;
    const walk = (node: any) => {
      if (!node.children) return;
      const next: any[] = [];
      for (const child of node.children) {
        if (child.type === 'text') {
          for (const p of splitText(child.value, m)) {
            next.push(
              p.cls
                ? { type: 'element', tagName: 'mark', properties: { className: [p.cls] }, children: [{ type: 'text', value: p.text }] }
                : { type: 'text', value: p.text },
            );
          }
        } else {
          if (child.tagName !== 'mark') walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree);
  };
}
