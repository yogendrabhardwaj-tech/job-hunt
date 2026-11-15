/**
 * One-time copy of the local data folder into the Vercel Blob store, so the deployed app starts with your data.
 *
 *   npm run blob:push            # dry run: lists what would be uploaded
 *   npm run blob:push -- --yes   # uploads
 *
 * Uploads db.json, settings.json, resumes/*.md and uploads/* to the store's data/ folder, overwriting what's
 * there. Credentials: BLOB_READ_WRITE_TOKEN, or VERCEL_OIDC_TOKEN + BLOB_STORE_ID.
 */
import fs from 'node:fs';
import path from 'node:path';
import { put } from '@vercel/blob';
import { DATA_DIR } from '../src/storage.ts';

const prefix = (process.env.BLOB_PREFIX || 'data').replace(/\/*$/, '/');
const go = process.argv.includes('--yes');

const files: string[] = [];
for (const f of ['db.json', 'settings.json']) if (fs.existsSync(path.join(DATA_DIR, f))) files.push(f);
for (const dir of ['resumes', 'uploads']) {
  const d = path.join(DATA_DIR, dir);
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (!f.startsWith('.') && !f.endsWith('.tmp')) files.push(`${dir}/${f}`);
}

console.log(`${go ? 'Uploading' : 'Would upload'} ${files.length} files from ${DATA_DIR} to Blob ${prefix}`);
for (const f of files) {
  if (!go) {
    console.log(`  ${f}`);
    continue;
  }
  await put(prefix + f, fs.readFileSync(path.join(DATA_DIR, f)), { access: 'private', allowOverwrite: true, addRandomSuffix: false });
  console.log(`  ✓ ${f}`);
}
if (!go) console.log('\nRun again with --yes to upload.');
process.exit(0);
