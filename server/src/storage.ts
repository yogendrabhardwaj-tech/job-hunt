import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlobPreconditionFailedError, del, get, list, put } from '@vercel/blob';
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
/** On Vercel the project folder is read-only; /tmp is the only writable place (and is wiped between instances). */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : process.env.VERCEL
    ? '/tmp/job-hunt-data'
    : path.join(ROOT, 'data');

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
  key === 'users.json' || /^(users\/[\w-]+\/)?(db\.json|settings\.json|usage-log\.json|resumes\/[\w.-]+\.md)$/.test(key);

interface Entry {
  content: string;
  updatedAt: string;
  /** Blob's version tag for this content, used to ask "has it changed?" cheaply and to write safely. */
  etag?: string;
}
const mirror = new Map<string, Entry>();
/** Keys changed locally and not yet saved to Blob. */
const pending = new Set<string>();

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
  const found: { key: string }[] = [];
  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
    for (const b of page.blobs) {
      const key = b.pathname.slice(BLOB_PREFIX.length);
      if (isMirrored(key)) found.push({ key });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  await Promise.all(found.map(({ key }) => fetchKey(key)));
}

/** Reads one key from Blob into the mirror. Returns true when the content changed. */
async function fetchKey(key: string): Promise<boolean> {
  const cur = mirror.get(key);
  const r = await get(BLOB_PREFIX + key, { access: 'private', useCache: false, ifNoneMatch: cur?.etag });
  if (!r) {
    // gone from Blob (deleted elsewhere)
    if (cur && !pending.has(key)) return mirror.delete(key);
    return false;
  }
  if (r.statusCode === 304) return false;
  const content = await streamToText(r.stream);
  if (pending.has(key)) return false; // a local change is waiting to be saved; it wins
  mirror.set(key, { content, updatedAt: r.blob.uploadedAt.toISOString(), etag: r.blob.etag });
  return cur?.content !== content;
}

if (backend === 'blob') await loadBlob();
else loadFs();
if (process.env.VERCEL && backend === 'fs')
  console.warn('[storage] No Vercel Blob store is connected, so accounts and data are lost whenever the server restarts.');
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
          if (e) {
            const r = await put(BLOB_PREFIX + key, e.content, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'text/plain; charset=utf-8' });
            if (mirror.get(key) === e) e.etag = r.etag;
          } else await del(BLOB_PREFIX + key);
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

// ---------------------------------------------------------------- keeping server instances in step
//
// On Vercel several server instances can run at once, each with its own in-memory copy. These bring a copy up to
// date with Blob. They use conditional reads (nothing is downloaded when a file hasn't changed) and are throttled,
// to stay well inside Blob's free monthly operation limits.

/** Re-reads one file from Blob. Returns true when it changed. No-op on disk. */
export async function refresh(key: string): Promise<boolean> {
  if (backend !== 'blob') return false;
  try {
    return await fetchKey(key);
  } catch (e: any) {
    console.error(`[storage] refreshing ${key} failed:`, e.message);
    return false;
  }
}

/** Re-reads every mirrored file under a prefix: picks up new, changed and deleted files. Returns true on any change. */
export async function refreshPrefix(prefix: string): Promise<boolean> {
  if (backend !== 'blob') return false;
  try {
    const remote = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: BLOB_PREFIX + prefix, cursor, limit: 1000 });
      for (const b of page.blobs) {
        const key = b.pathname.slice(BLOB_PREFIX.length);
        if (isMirrored(key)) remote.add(key);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    let changed = false;
    for (const key of [...mirror.keys()])
      if (key.startsWith(prefix) && !remote.has(key) && !pending.has(key)) changed = mirror.delete(key) || changed;
    const results = await Promise.all([...remote].map(fetchKey));
    return changed || results.some(Boolean);
  } catch (e: any) {
    console.error(`[storage] refreshing ${prefix} failed:`, e.message);
    return false;
  }
}

const USER_SYNC_MS = Number(process.env.USER_SYNC_MS || 30_000);
const USER_FULL_SYNC_MS = 10 * 60_000;
const synced = new Map<string, { at: number; fullAt: number }>();

/**
 * Brings one user's files up to date with Blob, at most every USER_SYNC_MS. Checks db.json (one conditional read);
 * when it changed elsewhere, or on this instance's first request for the user, re-reads all of the user's files.
 * Returns true when anything changed, so callers can drop parsed copies.
 */
export async function syncUser(userId: string): Promise<boolean> {
  if (backend !== 'blob') return false;
  const t = Date.now();
  const s = synced.get(userId);
  if (s && t - s.at < USER_SYNC_MS) return false;
  const prefix = `users/${userId}/`;
  const full = !s || t - s.fullAt > USER_FULL_SYNC_MS;
  synced.set(userId, { at: t, fullAt: full ? t : s!.fullAt });
  if (full) return refreshPrefix(prefix);
  return (await refresh(prefix + 'db.json')) && (await refreshPrefix(prefix), true);
}

/**
 * Read-modify-write of one file that several instances may change at once (the users list). Reads the latest
 * version, applies fn, and saves right away only if nobody else saved in between, retrying otherwise.
 */
export async function update(key: string, fn: (current: string | undefined) => string): Promise<void> {
  if (!isMirrored(key)) throw new Error(`Not a text data file: ${key}`);
  if (backend === 'fs') return writeText(key, fn(readText(key)));
  for (let attempt = 0; attempt < 5; attempt++) {
    await fetchKey(key);
    const cur = mirror.get(key);
    const content = fn(cur?.content);
    try {
      const r = await put(BLOB_PREFIX + key, content, {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'text/plain; charset=utf-8',
        ...(cur?.etag ? { allowOverwrite: true, ifMatch: cur.etag } : { allowOverwrite: false }),
      });
      mirror.set(key, { content, updatedAt: new Date().toISOString(), etag: r.etag });
      return;
    } catch (e: any) {
      const conflict = e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(e.message);
      if (!conflict) throw e;
    }
  }
  throw new Error(`Couldn't save ${key}: it kept changing. Try again.`);
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
