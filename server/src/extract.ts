import * as cheerio from 'cheerio';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export interface FetchedPosting {
  text: string;
  title?: string;
  company?: string;
  location?: string;
  postingId?: string;
  source: 'json-ld' | 'html' | 'api';
}

export const htmlToText = (html: string) => {
  const $ = cheerio.load(html);
  $('br').replaceWith('\n');
  $('li').each((_, el) => {
    $(el).prepend('• ').append('\n');
  });
  $('p,h1,h2,h3,h4,div,section').each((_, el) => {
    $(el).append('\n');
  });
  return $.root().text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
};

/** Greenhouse / Lever / Ashby expose public JSON for postings — far more reliable than scraping. */
async function tryAtsApi(url: URL): Promise<FetchedPosting | null> {
  try {
    const gh = url.pathname.match(/\/([\w-]+)\/jobs\/(\d+)/);
    if (/greenhouse\.io$/.test(url.hostname) && gh) {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs/${gh[2]}`);
      if (r.ok) {
        const j: any = await r.json();
        // Greenhouse returns entity-escaped HTML.
        const content = cheerio.load(j.content ?? '').text();
        return {
          text: htmlToText(content),
          title: j.title,
          company: gh[1],
          location: j.location?.name,
          postingId: String(j.id),
          source: 'api',
        };
      }
    }
    const lv = url.pathname.match(/^\/([\w-]+)\/([0-9a-f-]{36})/);
    if (url.hostname === 'jobs.lever.co' && lv) {
      const r = await fetch(`https://api.lever.co/v0/postings/${lv[1]}/${lv[2]}`);
      if (r.ok) {
        const j: any = await r.json();
        const lists = (j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`).join('\n\n');
        return {
          text: `${j.descriptionPlain ?? ''}\n\n${lists}\n\n${j.additionalPlain ?? ''}`.trim(),
          title: j.text,
          company: lv[1],
          location: j.categories?.location,
          postingId: j.id,
          source: 'api',
        };
      }
    }
  } catch {
    /* fall through to HTML */
  }
  return null;
}

export async function fetchPosting(rawUrl: string): Promise<FetchedPosting | null> {
  const url = new URL(rawUrl);
  const api = await tryAtsApi(url);
  if (api && api.text.length > 300) return api;

  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching posting`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Most ATS pages embed schema.org JobPosting JSON-LD for Google Jobs.
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const parsed = JSON.parse($(el).text());
      const items = ([] as any[]).concat(parsed['@graph'] ?? parsed);
      const jp = items.find((i) => i?.['@type'] === 'JobPosting');
      if (jp?.description) {
        const loc = [].concat(jp.jobLocation ?? []).map((l: any) => l?.address?.addressLocality).filter(Boolean);
        // Some sites entity-escape the HTML (&lt;p&gt;) — decode once before stripping tags.
        let desc: string = jp.description;
        if (!/<\w/.test(desc) && /&lt;/.test(desc)) desc = cheerio.load(desc).text();
        return {
          text: htmlToText(desc),
          title: jp.title,
          company: jp.hiringOrganization?.name,
          location: loc.join(', ') || (jp.jobLocationType === 'TELECOMMUTE' ? 'Remote' : undefined),
          postingId: jp.identifier?.value ? String(jp.identifier.value) : undefined,
          source: 'json-ld',
        };
      }
    } catch {
      /* ignore malformed blocks */
    }
  }

  $('script,style,noscript,svg,nav,footer,header,form,iframe').remove();
  const main = $('main').length ? $('main') : $('[class*="description"]').length ? $('[class*="description"]').first() : $('body');
  const text = htmlToText(main.html() ?? '');
  return {
    text: text.slice(0, 40_000),
    title: $('meta[property="og:title"]').attr('content') || $('title').text().trim() || undefined,
    company: $('meta[property="og:site_name"]').attr('content') || undefined,
    source: 'html',
  };
}

export function guessPostingId(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const k of ['gh_jid', 'jobId', 'jobid', 'job_id', 'currentJobId', 'jk', 'id']) {
      const v = u.searchParams.get(k);
      if (v) return v;
    }
    const m = u.pathname.match(/(\d{5,}|[0-9a-f]{8}-[0-9a-f-]{27})/i);
    return m?.[1] ?? '';
  } catch {
    return '';
  }
}

export async function fileToText(buf: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (ext === 'docx') return (await mammoth.extractRawText({ buffer: buf })).value;
  return buf.toString('utf8');
}
