import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as store from './store.ts';
import { emit } from './tasks.ts';
import { keywordCoverage } from './keywords.ts';
import { JOB_STATUSES, type Analysis, type Job } from './types.ts';

const ok = (data: unknown) => ({
  content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
});
const fail = (msg: string) => ({ content: [{ type: 'text' as const, text: `ERROR: ${msg}` }], isError: true });

const touched = (jobId: string) => emit({ type: 'job', jobId });

const jobSummary = (j: Job) => ({
  id: j.id,
  title: j.title,
  company: j.company,
  status: j.status,
  match: j.analysis?.score ?? null,
  tailoredMatch: j.tailored?.analysis?.score ?? null,
  tailoredFile: j.tailored?.file ?? null,
  url: j.url,
  createdAt: j.createdAt,
});

// ---------------------------------------------------------------- read tools

export const getProfile = tool('get_profile', "Get the candidate's profile, achievements, LinkedIn text and master resume Markdown.", {}, async () =>
  ok({ profile: store.getProfile(), masterResume: store.readMaster() || '(no master resume yet)' }),
);

export const listJobs = tool('list_jobs', 'List all tracked job applications with status and match scores.', {}, async () =>
  ok(store.listJobs().map(jobSummary)),
);

export const getJob = tool('get_job', 'Get the full record for one job (description, extracted requirements, analysis, tailored version).', { jobId: z.string() }, async ({ jobId }) => {
  const j = store.getJob(jobId);
  return j ? ok({ ...j, activity: j.activity.slice(0, 10) }) : fail(`No job ${jobId}`);
});

export const readResume = tool('read_resume', 'Read a resume Markdown file by name (master or a tailored copy).', { file: z.string() }, async ({ file }) => {
  try {
    return ok(store.readResume(file) || '(empty)');
  } catch (e: any) {
    return fail(e.message);
  }
});

// ---------------------------------------------------------------- write tools

const keywordSchema = z.object({
  term: z.string().describe('Exact phrase as an ATS would match it, e.g. "Kubernetes", "stakeholder management"'),
  category: z.enum(['hard', 'soft', 'domain', 'tool', 'certification']),
  importance: z.enum(['high', 'medium', 'low']),
});

export const saveJobDetails = tool(
  'save_job_details',
  'Persist structured details extracted from a job posting.',
  {
    jobId: z.string(),
    title: z.string(),
    company: z.string(),
    location: z.string().describe('City/region and Remote/Hybrid/Onsite if known'),
    employmentType: z.string().describe('Full-time, Contract, …; empty if unknown'),
    salary: z.string().describe('Range as written in posting; empty if not stated'),
    postingId: z.string().describe("The employer's requisition/job ID if visible; empty otherwise"),
    jdText: z.string().describe('Clean, complete job description text (only when the stored raw text was missing or noisy; else empty string)'),
    summary: z.string().describe('2–3 sentence plain-English summary of the role'),
    seniority: z.string(),
    yearsExperience: z.string(),
    responsibilities: z.array(z.string()),
    mustHave: z.array(z.string()).describe('Required qualifications, one per item'),
    niceToHave: z.array(z.string()).describe('Preferred / bonus qualifications'),
    keywords: z.array(keywordSchema).describe('15–35 ATS keywords, most important first'),
    redFlags: z.array(z.string()),
  },
  async (a) => {
    if (!store.getJob(a.jobId)) return fail(`No job ${a.jobId}`);
    store.updateJob(a.jobId, (j) => {
      Object.assign(j, {
        title: a.title || j.title,
        company: a.company,
        location: a.location,
        employmentType: a.employmentType,
        salary: a.salary,
        postingId: a.postingId || j.postingId,
      });
      if (a.jdText && a.jdText.length > 200) j.jdText = a.jdText;
      j.details = {
        summary: a.summary,
        seniority: a.seniority,
        yearsExperience: a.yearsExperience,
        responsibilities: a.responsibilities,
        mustHave: a.mustHave,
        niceToHave: a.niceToHave,
        keywords: a.keywords,
        redFlags: a.redFlags,
      };
    });
    store.logActivity(a.jobId, `Extracted ${a.mustHave.length} must-haves, ${a.keywords.length} keywords`, 'agent');
    touched(a.jobId);
    return ok('saved');
  },
);

export const saveMatchAnalysis = tool(
  'save_match_analysis',
  'Persist the match analysis of a resume against a job. Keyword coverage is computed by the server from the stored JD keywords.',
  {
    jobId: z.string(),
    target: z.enum(['master', 'tailored']),
    score: z.number().min(0).max(100).describe('Overall match % per the analyzer playbook (required 70% / preferred 30%, adjusted for experience fit)'),
    verdict: z.string().describe('One line, e.g. "Excellent fit — apply now" or "Stretch role"'),
    breakdown: z.object({
      required: z.number().min(0).max(100),
      preferred: z.number().min(0).max(100),
      keywords: z.number().min(0).max(100),
      experience: z.number().min(0).max(100),
    }),
    requirements: z
      .array(
        z.object({
          text: z.string(),
          type: z.enum(['must', 'nice']),
          status: z.enum(['met', 'partial', 'missing']),
          evidence: z.string().describe('Short quote/paraphrase from the resume proving it, or why it is missing'),
        }),
      )
      .describe('Every must-have and nice-to-have, assessed'),
    strengths: z.array(z.string()),
    gaps: z.array(z.object({ text: z.string(), severity: z.enum(['critical', 'major', 'minor']), suggestion: z.string() })),
    recommendations: z.array(z.string()).describe('Concrete edits to make the resume stronger for this job'),
    questionsForCandidate: z
      .array(z.string())
      .describe('Things the candidate might have done but the resume does not say — ask rather than invent'),
  },
  async (a) => {
    const job = store.getJob(a.jobId);
    if (!job) return fail(`No job ${a.jobId}`);
    const file = a.target === 'tailored' ? job.tailored?.file : store.getProfile().masterFile;
    if (!file) return fail('No tailored resume exists for this job yet');
    const kw = keywordCoverage(job.details?.keywords ?? [], store.readResume(file));
    const analysis: Analysis = {
      resumeFile: file,
      score: Math.round(a.score),
      verdict: a.verdict,
      breakdown: a.breakdown,
      keywordCoverage: kw.coverage,
      matchedKeywords: kw.matched,
      missingKeywords: kw.missing,
      requirements: a.requirements,
      strengths: a.strengths,
      gaps: a.gaps,
      recommendations: a.recommendations,
      questionsForCandidate: a.questionsForCandidate,
      at: store.now(),
    };
    store.updateJob(a.jobId, (j) => {
      if (a.target === 'tailored' && j.tailored) j.tailored.analysis = analysis;
      else j.analysis = analysis;
    });
    store.logActivity(a.jobId, `${a.target === 'tailored' ? 'Tailored' : 'Master'} resume scored ${analysis.score}% (keywords ${kw.coverage}%)`, 'agent');
    touched(a.jobId);
    return ok({ saved: true, keywordCoverage: kw.coverage, missingKeywords: kw.missing });
  },
);

export const saveTailoredResume = tool(
  'save_tailored_resume',
  'Save a tailored copy of the resume for a job. Creates/overwrites <Name>_Resume_<jobId>.md; the master is never modified.',
  {
    jobId: z.string(),
    markdown: z.string().describe('The COMPLETE tailored resume in the app Markdown format'),
    changes: z.array(z.string()).describe('Bullet list of what changed and why, for the candidate to review'),
  },
  async ({ jobId, markdown, changes }) => {
    if (!store.getJob(jobId)) return fail(`No job ${jobId}`);
    const file = store.tailoredFileName(jobId);
    store.writeResume(file, markdown);
    // name can change once the employer's posting ID is learned — drop the stale copy
    const prev = store.getJob(jobId)?.tailored?.file;
    if (prev && prev !== file) store.removeResume(prev);
    store.updateJob(jobId, (j) => {
      j.tailored = { file, createdAt: store.now(), changes };
    });
    store.logActivity(jobId, `Tailored resume saved as ${file}`, 'agent');
    touched(jobId);
    return ok({ file });
  },
);

export const saveMasterResume = tool(
  'save_master_resume',
  'Save the master resume Markdown and the contact details parsed from it.',
  {
    markdown: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    headline: z.string().describe('Short professional headline, e.g. "Senior Data Engineer · Cloud & Analytics"'),
  },
  async ({ markdown, ...fields }) => {
    const p = store.getProfile();
    store.writeResume(p.masterFile, markdown);
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v));
    store.updateProfile(clean);
    emit({ type: 'profile' });
    return ok({ file: p.masterFile });
  },
);

export const updateProfile = tool(
  'update_profile',
  'Update profile fields. For achievements, pass the FULL new achievements Markdown (append to existing, do not drop content).',
  {
    achievements: z.string().optional(),
    targetRoles: z.string().optional(),
    headline: z.string().optional(),
    linkedinUrl: z.string().optional(),
    linkedinText: z.string().optional(),
  },
  async (patch) => {
    store.updateProfile(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    emit({ type: 'profile' });
    return ok('updated');
  },
);

export const saveDocument = tool(
  'save_document',
  'Save a cover letter or interview-prep pack (Markdown) on a job record.',
  { jobId: z.string(), kind: z.enum(['cover-letter', 'interview-prep']), markdown: z.string() },
  async ({ jobId, kind, markdown }) => {
    if (!store.getJob(jobId)) return fail(`No job ${jobId}`);
    store.updateJob(jobId, kind === 'cover-letter' ? { coverLetter: markdown } : { interviewPrep: markdown });
    store.logActivity(jobId, kind === 'cover-letter' ? 'Cover letter drafted' : 'Interview prep pack created', 'agent');
    touched(jobId);
    return ok('saved');
  },
);

export const updateJobStatus = tool(
  'update_job_status',
  'Change the pipeline status of an application.',
  { jobId: z.string(), status: z.enum(JOB_STATUSES as [string, ...string[]]), note: z.string().optional() },
  async ({ jobId, status, note }) => {
    if (!store.getJob(jobId)) return fail(`No job ${jobId}`);
    store.updateJob(jobId, (j) => {
      j.status = status as Job['status'];
      if (status === 'applied' && !j.appliedAt) j.appliedAt = store.now();
    });
    store.logActivity(jobId, `Status → ${status}${note ? ` (${note})` : ''}`, 'status');
    touched(jobId);
    return ok('updated');
  },
);

export const addNote = tool('add_note', 'Append a note to a job record.', { jobId: z.string(), note: z.string() }, async ({ jobId, note }) => {
  if (!store.getJob(jobId)) return fail(`No job ${jobId}`);
  store.updateJob(jobId, (j) => {
    j.notes = j.notes ? `${j.notes}\n\n${note}` : note;
  });
  touched(jobId);
  return ok('added');
});

// ---------------------------------------------------------------- orchestration tools (chat agent only)

export const createJobFromUrl = tool(
  'create_job_from_url',
  'Create a new job record from a posting URL and start the background scan + match analysis. Returns the new jobId immediately. If the role already looks tracked, nothing is created and the existing records are returned — tell the user and only retry with allowDuplicate after they confirm.',
  {
    url: z.string().url(),
    jdText: z.string().optional().describe('Job description text if the user pasted it'),
    allowDuplicate: z.boolean().optional().describe('Create even if the role already appears to be tracked (user confirmed)'),
  },
  async ({ url, jdText, allowDuplicate }) => {
    const { startScan } = await import('./workflows.ts');
    const { guessPostingId } = await import('./extract.ts');
    const dups = store.findDuplicates({ url, postingId: guessPostingId(url) });
    if (dups.length && !allowDuplicate) return ok({ created: false, alreadyTracked: dups });
    const job = store.createJob({ url, jdText });
    startScan(job.id);
    return ok({ jobId: job.id, message: 'Scan started in background; it will appear on the Applications page.' });
  },
);

export const startWorkflow = tool(
  'start_workflow',
  'Kick off a background workflow for a job: analyze (re-score master), tailor (create tailored resume copy then re-score), cover-letter, interview-prep.',
  {
    jobId: z.string(),
    workflow: z.enum(['analyze', 'tailor', 'cover-letter', 'interview-prep']),
    instructions: z.string().optional().describe('Extra guidance from the user, e.g. "emphasise leadership"'),
  },
  async ({ jobId, workflow, instructions }) => {
    if (!store.getJob(jobId)) return fail(`No job ${jobId}`);
    const wf = await import('./workflows.ts');
    const t = wf.startWorkflow(jobId, workflow, instructions);
    return ok({ taskId: t.id, message: `${workflow} running in background` });
  },
);

export const readTools = [getProfile, listJobs, getJob, readResume];
export const chatTools = [
  ...readTools,
  saveJobDetails,
  saveMatchAnalysis,
  saveTailoredResume,
  saveMasterResume,
  updateProfile,
  saveDocument,
  updateJobStatus,
  addNote,
  createJobFromUrl,
  startWorkflow,
];
