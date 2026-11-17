import crypto from 'node:crypto';
import type { Profile } from '../types.ts';
import type { Preferences } from './consent.ts';

/**
 * Keeps contact details (and, by default, the name) out of everything sent to an AI source (issue #21).
 *
 * Known values from the profile become fixed placeholders ([[NAME]], [[EMAIL]], …). Anything else that looks like an
 * email, phone number, profile link or street address becomes a placeholder named after a hash of the value, so the
 * same value gets the same placeholder in every run. The real values are put back on our server: in what the save
 * tools write, and in the text streamed to the browser. They are never put back into web search or fetch arguments.
 *
 * This is best effort for free text. A name we don't know (e.g. in a resume imported before the profile has one)
 * can't be recognised, which is why the consent dialog says so.
 */

export interface Codec {
  redact(text: string): string;
  restore(text: string): string;
  redactDeep<T>(v: T): T;
  restoreDeep<T>(v: T): T;
  /** True when text holds a placeholder or a value we'd redact (used to block web searches). */
  sensitive(text: string): boolean;
}

const TOKEN = /\[\[([A-Z]+(?:_[A-Z]+)*(?:_[0-9a-f]{6})?)\]\]/g;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const short = (v: string) => crypto.createHash('sha256').update(v.toLowerCase()).digest('hex').slice(0, 6);
// letters and digits on either side mean we're inside a longer word
const B_START = '(?<![\\p{L}\\p{N}])';
const B_END = '(?![\\p{L}\\p{N}])';

const PATTERNS: { label: string; re: RegExp; ok?: (m: string) => boolean }[] = [
  { label: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  {
    label: 'LINK',
    re: /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/(?:in|pub)\/[\w%-]+|github\.com\/[\w-]+|(?:twitter|x)\.com\/\w+)\/?/gi,
  },
  { label: 'PHONE', re: /(?<![\d+])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g },
  {
    label: 'PHONE',
    re: /(?<![\w+])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?!\d)/g,
    ok: (m) => {
      const n = m.replace(/\D/g, '').length;
      return n >= 8 && n <= 15;
    },
  },
  {
    label: 'ADDRESS',
    re: /(?<![\w-])\d{1,6}\s+(?:[A-Z][A-Za-z]+\.?\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Parkway|Pkwy)\b\.?(?:,?\s+(?:Apt|Suite|Unit|#)\.?\s*[\w-]+)?/g,
  },
];

interface Known {
  value: string;
  token: string;
  re: RegExp;
}

export function codecFor(profile: Pick<Profile, 'name' | 'email' | 'phone' | 'location' | 'linkedinUrl'>, prefs: Pick<Preferences, 'includeName'>, seed: string[] = []): Codec {
  const byToken = new Map<string, string>();
  const known: Known[] = [];

  const add = (value: string | undefined, token: string, re?: RegExp) => {
    const v = value?.trim();
    if (!v || v.length < 2) return;
    if (known.some((k) => k.value.toLowerCase() === v.toLowerCase())) return;
    // a second spelling of something that already has this placeholder gets its own, so it comes back as written
    const own = byToken.has(token) && byToken.get(token) !== v ? token.replace(/\]\]$/, `_${short(v)}]]`) : token;
    known.push({ value: v, token: own, re: re ?? new RegExp(esc(v), 'gi') });
    byToken.set(own, v);
  };

  add(profile.email, '[[EMAIL]]');
  if (profile.linkedinUrl) {
    const bare = profile.linkedinUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
    add(profile.linkedinUrl, '[[LINKEDIN]]');
    add(bare, '[[LINKEDIN]]', new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?${esc(bare)}\\/?`, 'gi'));
  }
  add(profile.phone, '[[PHONE]]');
  if (profile.location) add(profile.location, '[[LOCATION]]', new RegExp(`${B_START}${esc(profile.location.trim())}${B_END}`, 'giu'));

  if (!prefs.includeName && profile.name?.trim()) {
    const full = profile.name.trim().replace(/\s+/g, ' ');
    const parts = full.split(' ');
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (parts.length === 1) add(full, '[[NAME]]', new RegExp(`${B_START}${esc(full)}${B_END}`, 'giu'));
    else {
      // "First Last", "First M Last", "First M. Last": the middle parts from the profile are optional
      const middles = parts.slice(1, -1).map((m) => esc(m.replace(/\.$/, '')));
      const mid = middles.length ? `(?:\\s+(?:${middles.join('|')})\\.?)*` : '';
      add(full, '[[NAME]]', new RegExp(`${B_START}${esc(first)}${mid}\\s+${esc(last)}${B_END}`, 'giu'));
      // single parts: case-sensitive, so a name that is also a common word only matches when capitalised
      if (last.length >= 3) add(last, '[[LAST_NAME]]', new RegExp(`${B_START}${esc(last)}${B_END}`, 'gu'));
      if (first.length >= 3) add(first, '[[FIRST_NAME]]', new RegExp(`${B_START}${esc(first)}${B_END}`, 'gu'));
    }
  }

  // longest first, so the full name goes before its parts and a URL before anything inside it
  const ordered = () => [...known].sort((a, b) => b.value.length - a.value.length);

  const discover = (text: string) => {
    for (const p of PATTERNS) {
      for (const m of text.matchAll(p.re)) {
        const v = m[0].trim();
        if (p.ok && !p.ok(v)) continue;
        if (known.some((k) => k.value.toLowerCase() === v.toLowerCase())) continue;
        add(v, `[[${p.label}_${short(v)}]]`);
      }
    }
  };

  const redact = (text: string): string => {
    if (!text) return text;
    discover(text);
    let out = text;
    for (const k of ordered())
      out = out.replace(k.re, (m) => {
        if (m === k.value) return k.token;
        // another way of writing it ("Jane Doe" for "Jane Q. Doe", a bare link): its own placeholder, so the
        // text comes back exactly as it was written
        const t = k.token.replace(/\]\]$/, `_${short(m)}]]`);
        byToken.set(t, m);
        return t;
      });
    return out;
  };

  const restore = (text: string): string => (text ? text.replace(TOKEN, (m) => byToken.get(m) ?? m) : text);

  const deep = (fn: (s: string) => string) =>
    function walk<T>(v: T): T {
      if (typeof v === 'string') return fn(v) as T;
      if (Array.isArray(v)) return v.map(walk) as T;
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) as T;
      return v;
    };

  for (const s of seed) if (s) discover(s);

  return {
    redact,
    restore,
    redactDeep: deep(redact),
    restoreDeep: deep(restore),
    sensitive: (text: string) => {
      if (!text) return false;
      if (/\[\[[A-Z]/.test(text)) return true;
      if (known.some((k) => new RegExp(k.re.source, k.re.flags.replace('g', '')).test(text))) return true;
      return PATTERNS.some((p) => [...text.matchAll(p.re)].some((m) => !p.ok || p.ok(m[0])));
    },
  };
}

/**
 * Restores placeholders in streamed text without breaking one that arrives split across chunks
 * ("[[NA" + "ME]]"): an unfinished "[[…" at the end is held back until the next chunk.
 */
export function streamRestorer(codec: Codec) {
  let held = '';
  return {
    push(delta: string): string {
      const buf = held + delta;
      const open = buf.lastIndexOf('[[');
      if (open >= 0 && buf.indexOf(']]', open) < 0 && buf.length - open < 40) {
        held = buf.slice(open);
        return codec.restore(buf.slice(0, open));
      }
      held = '';
      return codec.restore(buf);
    },
    flush(): string {
      const out = codec.restore(held);
      held = '';
      return out;
    },
  };
}
