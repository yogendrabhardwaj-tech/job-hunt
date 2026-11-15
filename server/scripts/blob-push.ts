/**
 * Copy the local data folder into the Vercel Blob store, so the deployed app has the same accounts and data.
 *
 *   npm run blob:push            # dry run: lists what would be uploaded
 *   npm run blob:push -- --yes   # uploads
 *
 * Uploads users.json and everything under users/ (each account's db.json, settings.json, resumes and uploads),
 * plus any pre-accounts files still at the top level, to the store's data/ folder, overwriting what's there.
 * users.json is merged instead, so accounts created on the deployed app are kept.
 * Skips dotfiles (such as the local .auth-secret), *.tmp files and _backup folders.
 * Credentials: BLOB_READ_WRITE_TOKEN, or VERCEL_OIDC_TOKEN + BLOB_STORE_ID.
 *
 * Redeploy afterwards: running servers keep the copy of the data they loaded when they started.
 */
import fs from 'node:fs';
import path from 'node:path';
import { put } from '@vercel/blob';
import { DATA_DIR, update } from '../src/storage.ts';

const prefix = (process.env.BLOB_PREFIX || 'data').replace(/\/*$/, '/');
const go = process.argv.includes('--yes');

const files: string[] = [];
const walk = (rel: string) => {
  for (const ent of fs.readdirSync(path.join(DATA_DIR, rel), { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name.startsWith('_backup') || ent.name.endsWith('.tmp')) continue;
    const key = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walk(key);
    else files.push(key);
  }
};
walk('');
files.sort();

console.log(`${go ? 'Uploading' : 'Would upload'} ${files.length} files from ${DATA_DIR} to Blob ${prefix}`);
for (const f of files) {
  if (!go) {
    console.log(`  ${f}`);
    continue;
  }
  if (f === 'users.json') {
    const local: { id: string; email: string }[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    await update(f, (raw) => {
      const remote: { id: string; email: string }[] = JSON.parse(raw ?? '[]');
      const add = local.filter((u) => !remote.some((r) => r.id === u.id || r.email === u.email));
      return JSON.stringify([...remote, ...add], null, 2);
    });
    console.log(`  ✓ ${f} (merged)`);
    continue;
  }
  await put(prefix + f, fs.readFileSync(path.join(DATA_DIR, f)), { access: 'private', allowOverwrite: true, addRandomSuffix: false });
  console.log(`  ✓ ${f}`);
}
if (!go) console.log('\nRun again with --yes to upload.');
process.exit(0);
