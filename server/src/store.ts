import type { DB, Job, Profile } from './types.ts';
import { guessPostingId } from './extract.ts';
import * as storage from './storage.ts';
import { currentUserId, userKey } from './context.ts';

export { ROOT, DATA_DIR } from './storage.ts';
const DB_FILE = 'db.json';

const emptyProfile = (): Profile => ({
  name: '',
  email: '',
  phone: '',
  location: '',
  headline: '',
  linkedinUrl: '',
  linkedinText: '',
  achievements: '',
  targetRoles: '',
  masterFile: 'master_resume.md',
  updatedAt: new Date().toISOString(),
});

function load(userId: string): DB {
  const raw = storage.readText(userKey(DB_FILE, userId));
  if (!raw) return { seq: 0, profile: emptyProfile(), jobs: [] };
  const d = JSON.parse(raw) as DB;
  d.profile = { ...emptyProfile(), ...d.profile };
  return d;
}

/** Each user's database, loaded on first use. */
const dbs = new Map<string, DB>();

/** The signed-in user's database. */
function db(): DB {
  const id = currentUserId();
  let d = dbs.get(id);
  if (!d) dbs.set(id, (d = load(id)));
  return d;
}

/** Drop a cached database so it's re-read from storage (after data is moved into an account). */
export function forget(userId: string) {
  dbs.delete(userId);
}

function persist() {
  storage.writeText(userKey(DB_FILE), JSON.stringify(db(), null, 2));
}

export const now = () => new Date().toISOString();

export function getProfile(): Profile {
  return db().profile;
}

export function updateProfile(patch: Partial<Profile>): Profile {
  db().profile = { ...db().profile, ...patch, updatedAt: now() };
  persist();
  return db().profile;
}

export function listJobs(): Job[] {
  db().jobs.forEach(expireStuckScan);
  return [...db().jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | undefined {
  const j = db().jobs.find((x) => x.id === id);
  if (j) expireStuckScan(j);
  return j;
}

const PLACEHOLDER_TITLE = 'Scanning role…';

/** Marks a scan as failed, and swaps the "Scanning role…" placeholder title for something that says what it is. */
export function failScan(id: string, error: string, log = false) {
  const j = db().jobs.find((x) => x.id === id);
  if (!j) return;
  j.scan = { state: 'error', error };
  if (j.title === PLACEHOLDER_TITLE) {
    let host = '';
    try {
      host = j.url ? new URL(j.url).hostname.replace(/^www\./, '') : '';
    } catch {}
    j.title = host ? `Role from ${host}` : 'Untitled role';
  }
  j.updatedAt = now();
  persist();
  if (log) logActivity(id, `Scan failed: ${error}`, 'error');
}

/**
 * A scan still "pending" or "running" long after it started died without reporting (on Vercel a function is
 * stopped after 5 minutes). Show it as failed so it can be retried, instead of "Scanning…" forever.
 */
const STUCK_SCAN_MS = 6 * 60_000;
function expireStuckScan(j: Job) {
  if ((j.scan.state === 'pending' || j.scan.state === 'running') && Date.now() - new Date(j.updatedAt).getTime() > STUCK_SCAN_MS)
    failScan(j.id, 'The scan stopped before it finished. Try again.', true);
}

export function createJob(input: { url: string; jdText?: string }): Job {
  db().seq += 1;
  const id = `J${String(db().seq).padStart(4, '0')}`;
  const job: Job = {
    id,
    url: input.url,
    title: PLACEHOLDER_TITLE,
    company: '',
    location: '',
    employmentType: '',
    salary: '',
    postingId: input.url ? guessPostingId(input.url) : '',
    status: 'saved',
    createdAt: now(),
    updatedAt: now(),
    jdText: input.jdText ?? '',
    notes: '',
    activity: [{ at: now(), text: 'Record created', kind: 'info' }],
    scan: { state: 'pending' },
  };
  db().jobs.push(job);
  persist();
  return job;
}

export function updateJob(id: string, patch: Partial<Job> | ((j: Job) => void)): Job {
  const job = getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  if (typeof patch === 'function') patch(job);
  else Object.assign(job, patch);
  job.updatedAt = now();
  persist();
  return job;
}

export function logActivity(id: string, text: string, kind: Job['activity'][number]['kind'] = 'info') {
  updateJob(id, (j) => {
    j.activity.unshift({ at: now(), text, kind });
    j.activity = j.activity.slice(0, 200);
  });
}

export function deleteJob(id: string) {
  const job = getJob(id);
  db().jobs = db().jobs.filter((j) => j.id !== id);
  if (job?.tailored?.file) removeResume(job.tailored.file);
  persist();
}

// ---------- duplicate detection ----------

const JOB_ID_PARAMS = ['gh_jid', 'jobid', 'job_id', 'currentjobid', 'jk', 'id', 'req', 'requisitionid'];

/** host + path (+ job-id query params only), lower-cased, no trailing slash / locale noise. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const keep = [...u.searchParams.entries()].filter(([k]) => JOB_ID_PARAMS.includes(k.toLowerCase()));
    const q = keep.map(([k, v]) => `${k.toLowerCase()}=${v}`).sort().join('&');
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase() + (q ? `?${q}` : '');
  } catch {
    return raw.trim().toLowerCase();
  }
}

const COMPANY_NOISE = new Set(['inc', 'llc', 'llp', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'plc', 'gmbh', 'ag', 'sa', 'the', 'us', 'usa', 'uk', 'india', 'global', 'group', 'careers', 'jobs']);
const normCompany = (c = '') =>
  c.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !COMPANY_NOISE.has(w)).join(' ');
const normTitle = (t = '') => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hostOf = (u = '') => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export interface DuplicateMatch {
  id: string;
  title: string;
  company: string;
  status: Job['status'];
  reason: string;
}

/** Existing jobs that look like the same role: same link, same employer job ID, or same title at the same company. */
export function findDuplicates(c: { id?: string; url?: string; postingId?: string; company?: string; title?: string }): DuplicateMatch[] {
  const url = c.url ? normalizeUrl(c.url) : '';
  const company = normCompany(c.company);
  const title = normTitle(c.title);
  const out: DuplicateMatch[] = [];
  for (const j of db().jobs) {
    if (j.id === c.id) continue;
    const sameCompany = !!company && company === normCompany(j.company);
    let reason = '';
    if (url && j.url && url === normalizeUrl(j.url)) reason = 'Same job link';
    else if (c.postingId && j.postingId && c.postingId === j.postingId && (sameCompany || (!!c.url && hostOf(c.url) === hostOf(j.url))))
      reason = `Same job ID ${j.postingId}${j.company ? ` at ${j.company}` : ''}`;
    else if (sameCompany && title && title === normTitle(j.title)) reason = `Same role title at ${j.company}`;
    if (reason) out.push({ id: j.id, title: j.title, company: j.company, status: j.status, reason });
  }
  return out;
}

// ---------- resume files ----------

const SAFE = /^[\w.-]+\.md$/;

/** Storage key for a resume file; also validates the name. */
export function resumeKey(file: string) {
  if (!SAFE.test(file)) throw new Error('Invalid resume file name');
  return userKey(`resumes/${file}`);
}

export function resumeExists(file: string) {
  return storage.exists(resumeKey(file));
}

export function readResume(file: string): string {
  return storage.readText(resumeKey(file)) ?? '';
}

export function writeResume(file: string, content: string) {
  storage.writeText(resumeKey(file), content.trimEnd() + '\n');
}

export function removeResume(file: string) {
  storage.remove(resumeKey(file));
}

export function renameResume(from: string, to: string) {
  storage.rename(resumeKey(from), resumeKey(to));
}

/** Keeps a copy of an uploaded original (PDF/DOCX/…). */
export function archiveUpload(originalName: string, data: Buffer) {
  return storage.putBinary(`${userKey('uploads')}/${Date.now()}_${originalName.replace(/[^\w.-]/g, '_')}`, data);
}

export function readMaster(): string {
  return readResume(db().profile.masterFile);
}

export function listResumeFiles() {
  const prefix = userKey('resumes/');
  return storage
    .listFiles(prefix)
    .map(({ key, size, updatedAt }) => ({ file: key.slice(prefix.length), size, updatedAt }))
    .filter(({ file }) => SAFE.test(file))
    .map((f) => ({ ...f, master: f.file === db().profile.masterFile }))
    .sort((a, b) => (a.master ? -1 : b.master ? 1 : b.updatedAt.localeCompare(a.updatedAt)));
}

/**
 * Tailored copy name: <Name>_Resume_<appJobId>[_<employerPostingId>][_<Company>].md
 * e.g. Yogendra_Soni_Resume_J0003_372316_Deloitte_US.md — app ID always present for consistency,
 * the employer's requisition/role ID and the company appended when known.
 */
export function tailoredFileName(jobId: string) {
  const slug = (v: string, sep: string, max: number) =>
    v.trim().replace(/[^\w]+/g, sep).replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '').slice(0, max);
  const job = getJob(jobId);
  const base = slug(db().profile.name || 'Resume', '_', 60);
  const parts = [`${base}${/resume/i.test(base) ? '' : '_Resume'}`, jobId, slug(job?.postingId ?? '', '-', 40), slug(job?.company ?? '', '_', 40)];
  return `${parts.filter(Boolean).join('_')}.md`;
}

// ---------- privacy: pending import and deletion (issues #22, #24) ----------

const PENDING = 'pending-import.txt';

/** Resume text extracted on our server but not yet converted, because AI processing isn't agreed to (yet). */
export const readPendingImport = () => storage.readText(userKey(PENDING)) ?? '';
export const savePendingImport = (text: string) => storage.writeText(userKey(PENDING), text);
export const clearPendingImport = () => storage.remove(userKey(PENDING));
export function pendingImportInfo() {
  const f = storage.listFiles(userKey(PENDING))[0];
  return f ? { chars: f.size, at: f.updatedAt } : null;
}

/**
 * Turns extracted text into a master resume without AI: a name heading, then the text as it came out of the file.
 * Layout problems from the extraction stay; the user can fix them with Edit.
 */
export function saveMasterAsIs(text: string) {
  const name = db().profile.name.trim();
  const body = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  writeResume(db().profile.masterFile, name && !body.startsWith('#') ? `# ${name}\n\n${body}` : body);
  updateProfile({});
}

/**
 * Deletes the signed-in user's resume data: profile details (the account email stays), every job with its
 * description, analyses, documents and notes, every resume file and any pending import. Job numbering continues.
 */
export function deleteResumeData(): { resumes: number } {
  const prefix = userKey('resumes/');
  const files = storage.listFiles(prefix);
  for (const f of files) storage.remove(f.key);
  clearPendingImport();
  const d = db();
  dbs.set(currentUserId(), { seq: d.seq, profile: { ...emptyProfile(), email: d.profile.email }, jobs: [] });
  persist();
  return { resumes: files.length };
}
