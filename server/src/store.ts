import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB, Job, Profile } from './types.ts';
import { guessPostingId } from './extract.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
export const RESUME_DIR = path.join(DATA_DIR, 'resumes');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

for (const d of [DATA_DIR, RESUME_DIR, UPLOAD_DIR]) fs.mkdirSync(d, { recursive: true });

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

function load(): DB {
  if (!fs.existsSync(DB_FILE)) return { seq: 0, profile: emptyProfile(), jobs: [] };
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DB;
  db.profile = { ...emptyProfile(), ...db.profile };
  return db;
}

const db: DB = load();

function persist() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export const now = () => new Date().toISOString();

export function getProfile(): Profile {
  return db.profile;
}

export function updateProfile(patch: Partial<Profile>): Profile {
  db.profile = { ...db.profile, ...patch, updatedAt: now() };
  persist();
  return db.profile;
}

export function listJobs(): Job[] {
  return [...db.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | undefined {
  return db.jobs.find((j) => j.id === id);
}

export function createJob(input: { url: string; jdText?: string }): Job {
  db.seq += 1;
  const id = `J${String(db.seq).padStart(4, '0')}`;
  const job: Job = {
    id,
    url: input.url,
    title: 'Scanning role…',
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
  db.jobs.push(job);
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
  db.jobs = db.jobs.filter((j) => j.id !== id);
  if (job?.tailored?.file) {
    const f = path.join(RESUME_DIR, job.tailored.file);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
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
  for (const j of db.jobs) {
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

export function resumePath(file: string) {
  if (!SAFE.test(file)) throw new Error('Invalid resume file name');
  return path.join(RESUME_DIR, file);
}

export function readResume(file: string): string {
  const p = resumePath(file);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

export function writeResume(file: string, content: string) {
  fs.writeFileSync(resumePath(file), content.trimEnd() + '\n');
}

export function removeResume(file: string) {
  const p = resumePath(file);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function readMaster(): string {
  return readResume(db.profile.masterFile);
}

export function listResumeFiles() {
  return fs
    .readdirSync(RESUME_DIR)
    .filter((f) => SAFE.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(RESUME_DIR, f));
      return { file: f, size: st.size, updatedAt: st.mtime.toISOString(), master: f === db.profile.masterFile };
    })
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
  const base = slug(db.profile.name || 'Resume', '_', 60);
  const parts = [`${base}${/resume/i.test(base) ? '' : '_Resume'}`, jobId, slug(job?.postingId ?? '', '-', 40), slug(job?.company ?? '', '_', 40)];
  return `${parts.filter(Boolean).join('_')}.md`;
}
