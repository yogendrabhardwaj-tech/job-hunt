import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { del, get, list, put } from '@vercel/blob';
import { waitUntil } from '@vercel/functions';

/**
 * Where the app's data lives: a folder on disk (local default) or a private Vercel Blob store.
 *
 * Text data (db.json, settings.json, resumes/*.md) is loaded into memory once at startup, so the rest of
 * the app reads synchronously. Writes update memory immediately and are then saved:
 *   - disk: straight away, atomically (same behaviour as before Blob support)
 *   - blob: batched, at most once per file every BLOB_FLUSH_MS. Blob's free tier allows 2,000 writes a month,
 *     and the app changes db.json/settings.json many times per agent run.
 * Binary uploads (original resume/LinkedIn files) are archive-only: written once, never read back.
 *
 * Blob mode: STORAGE=blob, or automatically on Vercel when a Blob store is connected.
 * Auth comes from BLOB_STORE_ID + OIDC (connected store on Vercel) or BLOB_READ_WRITE_TOKEN.
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');

const hasBlobCreds = !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
export const backend: 'fs' | 'blob' =
  process.env.STORAGE === 'blob' || (process.env.STORAGE !== 'fs' && !!process.env.VERCEL && hasBlobCreds) ? 'blob' : 'fs';

const BLOB_FLUSH_MS = Number(process.env.BLOB_FLUSH_MS || 15_000);
/** Everything goes under one prefix so the store can hold other things later. */
const BLOB_PREFIX = (process.env.BLOB_PREFIX || 'data').replace(/\/*$/, '/');
/** Keys holding secrets get owner-only permissions on disk. */
const isPrivate = (key: string) => key.endsWith('settings.json') || key === 'users.json';

/**
 * A key is mirrored in memory when it's one of these: the user registry, or a user's db.json, settings.json or
 * resumes/*.md under users/<id>/. Unprefixed db.json/settings.json/resumes are pre-accounts data, kept until
 * their owner signs in and claims them.
 */
const isMirrored = (key: string) =>
  key === 'users.json' || /^(users\/[\w-]+\/)?(db\.json|settings\.json|resumes\/[\w.-]+\.md)$/.test(key);

interface Entry {
  content: string;
  updatedAt: string;
}
const mirror = new Map<string, Entry>();

// ---------------------------------------------------------------- startup load

async function streamToText(s: ReadableStream<Uint8Array>) {
  return new Response(s).text();
}

function loadFs() {
  for (const d of ['', 'resumes', 'uploads']) fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true });
  const take = (key: string) => {
    const p = path.join(DATA_DIR, key);
    if (!fs.existsSync(p)) return;
    mirror.set(key, { content: fs.readFileSync(p, 'utf8'), updatedAt: fs.statSync(p).mtime.toISOString() });
  };
  // walk the data folder for every mirrored file (skip uploads, which are archive-only)
  const walk = (rel: string) => {
    for (const ent of fs.readdirSync(path.join(DATA_DIR, rel), { withFileTypes: true })) {
      const key = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) ent.name !== 'uploads' && walk(key);
      else if (isMirrored(key)) take(key);
    }
  };
  walk('');
}

async function loadBlob() {
  let cursor: string | undefined;
  const found: { key: string; uploadedAt: Date }[] = [];
  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
    for (const b of page.blobs) {
      const key = b.pathname.slice(BLOB_PREFIX.length);
      if (isMirrored(key)) found.push({ key, uploadedAt: b.uploadedAt });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  await Promise.all(
    found.map(async ({ key, uploadedAt }) => {
      const r = await get(BLOB_PREFIX + key, { access: 'private', useCache: false });
      if (r?.statusCode === 200) mirror.set(key, { content: await streamToText(r.stream), updatedAt: uploadedAt.toISOString() });
    }),
  );
}

if (backend === 'blob') await loadBlob();
else loadFs();
console.log(`[storage] ${backend === 'blob' ? 'Vercel Blob (private)' : DATA_DIR} · ${mirror.size} files loaded`);

// ---------------------------------------------------------------- reads

export function readText(key: string): string | undefined {
  return mirror.get(key)?.content;
}

export function exists(key: string) {
  return mirror.has(key);
}

/** Mirrored files under a prefix, e.g. list('resumes/'). */
export function listFiles(prefix: string): { key: string; size: number; updatedAt: string }[] {
  return [...mirror.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .map(([key, e]) => ({ key, size: Buffer.byteLength(e.content), updatedAt: e.updatedAt }));
}

// ---------------------------------------------------------------- writes

const pending = new Set<string>();
let timer: NodeJS.Timeout | undefined;
let inFlight: Promise<void> = Promise.resolve();

function fsWrite(key: string, content: string) {
  const p = path.join(DATA_DIR, key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content, isPrivate(key) ? { mode: 0o600 } : undefined);
  fs.renameSync(tmp, p);
}

function fsRemove(key: string) {
  const p = path.join(DATA_DIR, key);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function schedule(key: string) {
  pending.add(key);
  if (timer) return; // a flush is already due; it will pick this key up
  timer = setTimeout(() => {
    timer = undefined;
    flush();
  }, BLOB_FLUSH_MS);
  // On Vercel, keep the function alive until the batched write lands (no-op elsewhere).
  waitUntil(new Promise<void>((resolve) => setTimeout(() => inFlight.then(resolve), BLOB_FLUSH_MS + 50)));
}

/** Saves every pending change to Blob now. Safe to call any time; a no-op on disk. */
export function flush(): Promise<void> {
  if (backend !== 'blob' || !pending.size) return inFlight;
  if (timer) clearTimeout(timer), (timer = undefined);
  const keys = [...pending];
  pending.clear();
  inFlight = inFlight.then(() =>
    Promise.all(
      keys.map(async (key) => {
        const e = mirror.get(key);
        try {
          if (e) await put(BLOB_PREFIX + key, e.content, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'text/plain; charset=utf-8' });
          else await del(BLOB_PREFIX + key);
        } catch (err: any) {
          console.error(`[storage] saving ${key} to Blob failed, will retry:`, err.message);
          schedule(key);
        }
      }),
    ).then(() => {}),
  );
  waitUntil(inFlight);
  return inFlight;
}

export function writeText(key: string, content: string) {
  if (!isMirrored(key)) throw new Error(`Not a text data file: ${key}`);
  mirror.set(key, { content, updatedAt: new Date().toISOString() });
  if (backend === 'fs') fsWrite(key, content);
  else schedule(key);
}

export function remove(key: string) {
  if (!mirror.delete(key)) return;
  if (backend === 'fs') fsRemove(key);
  else schedule(key);
}

export function rename(from: string, to: string) {
  const e = mirror.get(from);
  if (!e) return;
  writeText(to, e.content);
  remove(from);
}

/** Archive-only binary files (original uploads). Written straight through; never read back by the app. */
export async function putBinary(key: string, data: Buffer) {
  if (backend === 'fs') {
    fs.mkdirSync(path.dirname(path.join(DATA_DIR, key)), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, key), data);
  }
  else await put(BLOB_PREFIX + key, data, { access: 'private', allowOverwrite: true, addRandomSuffix: false });
}

// Save anything still pending before the process exits.
for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.once(sig, () => {
    flush().finally(() => process.exit(0));
  });
