import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// a throwaway data folder on disk for every test file; never Blob, never the real data/ folder
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-test-'));
process.env.STORAGE = 'fs';
process.env.AUTH_SECRET = 'test-secret';
delete process.env.VERCEL;
delete process.env.OPENROUTER_API_KEY;
delete process.env.NARAROUTER_API_KEY;
