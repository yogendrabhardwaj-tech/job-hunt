import * as store from './store.ts';
import { runAgent, skill, RESUME_FORMAT } from './agent.ts';
import { createTask, emit, finishTask, findRunning, pushEvent } from './tasks.ts';
import { fetchPosting, guessPostingId } from './extract.ts';
import * as T from './tools.ts';
import type { Task, TaskKind } from './types.ts';

const TRUTH = `Truthfulness is non-negotiable: never invent employers, titles, dates, metrics, degrees, certifications or skills.
You may only use facts present in the master resume, the achievements notes, or the LinkedIn text. Reordering, re-wording with the
job's terminology, and surfacing facts from the achievements notes are encouraged. If something would help but is not supported,
put it in questionsForCandidate / changes notes instead of writing it.`;

function candidateContext(includeExtra = true) {
  const p = store.getProfile();
  const master = store.readMaster();
  return [
    `<master_resume file="${p.masterFile}">\n${master || '(none yet)'}\n</master_resume>`,
    includeExtra && p.achievements ? `<achievements_notes>\n${p.achievements}\n</achievements_notes>` : '',
    includeExtra && p.linkedinText ? `<linkedin_profile url="${p.linkedinUrl}">\n${p.linkedinText}\n</linkedin_profile>` : '',
    p.targetRoles ? `<target_roles>${p.targetRoles}</target_roles>` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function jobContext(jobId: string) {
  const j = store.getJob(jobId)!;
  return `<job id="${j.id}" title="${j.title}" company="${j.company}" location="${j.location}" url="${j.url}">
<structured_details>${JSON.stringify(j.details ?? {}, null, 1)}</structured_details>
<description>
${j.jdText}
</description>
</job>`;
}

/** Run fn as a tracked task; dedupes concurrent runs of the same workflow on the same job. */
function launch(kind: TaskKind, title: string, jobId: string | undefined, fn: (t: Task) => Promise<void>): Task {
  const existing = findRunning(kind, jobId);
  if (existing) return existing as Task;
  const task = createTask(kind, title, jobId);
  fn(task)
    .then(() => {
      pushEvent(task, { type: 'done', text: 'Completed' });
      finishTask(task);
    })
    .catch((e: Error) => {
      console.error(`[${kind}]`, e);
      pushEvent(task, { type: 'error', text: e.message });
      finishTask(task, e.message);
      if (jobId) {
        store.logActivity(jobId, `${title} failed: ${e.message}`, 'error');
        emit({ type: 'job', jobId });
      }
    });
  return task;
}

// ---------------------------------------------------------------- scan

export function startScan(jobId: string) {
  return launch('scan', 'Scan job posting', jobId, async (task) => {
    store.updateJob(jobId, { scan: { state: 'running' } });
    emit({ type: 'job', jobId });
    const job = store.getJob(jobId)!;

    if (!job.jdText && job.url) {
      pushEvent(task, { type: 'status', text: `Fetching ${job.url}` });
      try {
        const posting = await fetchPosting(job.url);
        if (posting) {
          store.updateJob(jobId, (j) => {
            j.jdText = posting.text;
            j.title = posting.title || j.title;
            j.company = posting.company || j.company;
            j.location = posting.location || j.location;
            j.postingId = posting.postingId || j.postingId || guessPostingId(j.url);
          });
          pushEvent(task, { type: 'status', text: `Fetched ${posting.text.length.toLocaleString()} chars via ${posting.source}` });
        }
      } catch (e: any) {
        pushEvent(task, { type: 'status', text: `Direct fetch failed (${e.message}); the agent will try web fetch` });
      }
    }

    const fresh = store.getJob(jobId)!;
    const thin = fresh.jdText.length < 600;
    await runAgent({
      task,
      tools: [T.saveJobDetails],
      web: thin,
      system: `You are the intake analyst of a personal job-search agency. Extract a job posting into structured data.
Follow the "Extract Requirements" and "Keyword Extraction" steps of the playbook below.
${skill('job-description-analyzer')}`,
      prompt: `${thin ? `The fetched page text is thin or missing (likely JS-rendered or login-gated). Use WebFetch on ${fresh.url} (and if needed WebSearch for the title + company) to get the full description. If you still cannot get it, save what you can and put "Could not read full posting — paste the description" in redFlags.\n\n` : ''}Job record ${jobId}. URL: ${fresh.url}
Current guesses — title: "${fresh.title}", company: "${fresh.company}", location: "${fresh.location}".

<raw_page_text>
${fresh.jdText || '(none)'}
</raw_page_text>

Call save_job_details exactly once with jobId "${jobId}". Strip page chrome (cookie banners, nav, "apply now", other job listings). ${thin ? 'Include the clean full description in jdText.' : 'Leave jdText empty unless the raw text is mostly noise, in which case provide the cleaned description.'}`,
    });

    store.updateJob(jobId, { scan: { state: 'done' } });
    store.logActivity(jobId, 'Job posting scanned', 'agent');
    const dups = store.findDuplicates(store.getJob(jobId)!);
    if (dups.length) {
      store.logActivity(jobId, `Possible duplicate of ${dups.map((d) => `${d.id} (${d.reason})`).join(', ')}`, 'error');
      pushEvent(task, { type: 'status', text: `Possible duplicate of ${dups.map((d) => d.id).join(', ')}` });
    }
    emit({ type: 'job', jobId });
    if (store.readMaster()) startAnalyze(jobId, 'master');
  });
}

// ---------------------------------------------------------------- analyze

export function startAnalyze(jobId: string, target: 'master' | 'tailored' = 'master') {
  return launch('analyze', target === 'tailored' ? 'Score tailored resume' : 'Match analysis', jobId, async (task) => {
    const job = store.getJob(jobId)!;
    if (!job.details) throw new Error('Job has not been scanned yet');
    const file = target === 'tailored' ? job.tailored?.file : store.getProfile().masterFile;
    if (!file) throw new Error('No resume to analyze');
    const resume = store.readResume(file);
    if (!resume) throw new Error('Master resume is empty — import your resume on the Profile page first');

    await runAgent({
      task,
      tools: [T.saveMatchAnalysis],
      system: `You are a senior recruiter and ATS specialist. Score how well a resume matches a job, strictly and honestly.
Use the match calculation, gap analysis and interpretation bands from the playbooks below. Score only what the RESUME TEXT shows
(a recruiter will not see the achievements notes) — but when the notes contain evidence the resume lacks, call that out in recommendations.
${skill('job-description-analyzer')}
${skill('resume-ats-optimizer')}`,
      prompt: `${jobContext(jobId)}

<resume_under_review file="${file}">
${resume}
</resume_under_review>

${store.getProfile().achievements ? `<achievements_notes>\n${store.getProfile().achievements}\n</achievements_notes>` : ''}

Assess every must-have and nice-to-have, then call save_match_analysis once with jobId "${jobId}" and target "${target}".`,
    });
  });
}

// ---------------------------------------------------------------- tailor

export function startTailor(jobId: string, instructions?: string) {
  return launch('tailor', 'Tailor resume', jobId, async (task) => {
    const job = store.getJob(jobId)!;
    if (!job.details) throw new Error('Job has not been scanned yet');
    if (!store.readMaster()) throw new Error('Import your master resume on the Profile page first');

    await runAgent({
      task,
      tools: [T.saveTailoredResume],
      system: `You are an expert resume writer at a career agency. Produce a tailored copy of the candidate's resume for one job.
${TRUTH}
Apply the playbooks below: rewrite the summary for this role, reorder skills so the job's top requirements come first, lead each role
with its most relevant bullet, weave in the job's exact keywords where they are TRUE, quantify impact (only with real numbers), and keep
it ATS-safe. Keep length similar to the master (1–2 pages).
${RESUME_FORMAT}
${skill('resume-tailor')}
${skill('resume-bullet-writer')}
${skill('resume-ats-optimizer')}`,
      prompt: `${jobContext(jobId)}

${candidateContext()}

${job.analysis ? `<current_match_analysis score="${job.analysis.score}">\nGaps: ${JSON.stringify(job.analysis.gaps)}\nMissing keywords: ${job.analysis.missingKeywords.join(', ')}\nRecommendations: ${JSON.stringify(job.analysis.recommendations)}\n</current_match_analysis>` : ''}
${job.tailored ? `<previous_tailored_version>\n${store.readResume(job.tailored.file)}\n</previous_tailored_version>` : ''}
${instructions ? `<candidate_instructions>${instructions}</candidate_instructions>` : ''}

Write the full tailored resume and call save_tailored_resume once with jobId "${jobId}". In "changes", list each meaningful edit and
any keyword you deliberately did NOT add because it is not supported by the candidate's real experience.`,
    });

    pushEvent(task, { type: 'status', text: 'Re-scoring tailored version…' });
    startAnalyze(jobId, 'tailored');
  });
}

// ---------------------------------------------------------------- documents

export function startCoverLetter(jobId: string, instructions?: string) {
  return launch('cover-letter', 'Cover letter', jobId, async (task) => {
    const job = store.getJob(jobId)!;
    const resume = job.tailored ? store.readResume(job.tailored.file) : store.readMaster();
    await runAgent({
      task,
      tools: [T.saveDocument],
      web: true,
      system: `You write concise, specific cover letters (250–350 words) that sound like a real person, not a template.
${TRUTH}
${skill('cover-letter-generator')}`,
      prompt: `${jobContext(jobId)}\n\n<resume>\n${resume}\n</resume>\n\n${candidateContext()}\n${instructions ? `<candidate_instructions>${instructions}</candidate_instructions>` : ''}

Optionally do ONE quick WebSearch on the company for a genuine, specific hook. Then call save_document with kind "cover-letter".`,
    });
  });
}

export function startInterviewPrep(jobId: string, instructions?: string) {
  return launch('interview-prep', 'Interview prep', jobId, async (task) => {
    const job = store.getJob(jobId)!;
    const resume = job.tailored ? store.readResume(job.tailored.file) : store.readMaster();
    await runAgent({
      task,
      tools: [T.saveDocument],
      web: true,
      system: `You are an interview coach. Build a focused prep pack in Markdown: likely questions (behavioral + role-specific + technical),
5–8 STAR stories mapped to the job's requirements using ONLY the candidate's real experience, how to address each gap honestly,
company research notes, and smart questions to ask.
${skill('interview-prep-generator')}`,
      prompt: `${jobContext(jobId)}\n\n<resume>\n${resume}\n</resume>\n\n${candidateContext()}\n${job.analysis ? `<gaps>${JSON.stringify(job.analysis.gaps)}</gaps>` : ''}\n${instructions ? `<candidate_instructions>${instructions}</candidate_instructions>` : ''}

Use at most 2 WebSearch calls for company context. Then call save_document with kind "interview-prep".`,
    });
  });
}

export function startWorkflow(jobId: string, wf: 'analyze' | 'tailor' | 'cover-letter' | 'interview-prep', instructions?: string) {
  if (wf === 'analyze') return startAnalyze(jobId, 'master');
  if (wf === 'tailor') return startTailor(jobId, instructions);
  if (wf === 'cover-letter') return startCoverLetter(jobId, instructions);
  return startInterviewPrep(jobId, instructions);
}

// ---------------------------------------------------------------- resume import

export function startImportResume(rawText: string) {
  return launch('import-resume', 'Import master resume', undefined, async (task) => {
    const p = store.getProfile();
    await runAgent({
      task,
      tools: [T.saveMasterResume],
      system: `You convert a raw resume (text extracted from PDF/DOCX, so layout may be scrambled) into clean Markdown.
Preserve EVERY fact, bullet, date and number. Fix only extraction artefacts (broken lines, stray symbols, column interleaving).
Do not rewrite or improve wording — this is the master copy.
${RESUME_FORMAT}`,
      prompt: `<raw_resume>\n${rawText}\n</raw_resume>\n${p.linkedinUrl ? `LinkedIn URL to include in the contact line: ${p.linkedinUrl}\n` : ''}
Call save_master_resume once with the Markdown and the contact fields you can find.`,
    });
    // existing analyses are now stale — re-score active applications
    for (const j of store.listJobs()) if (j.details && !['rejected', 'withdrawn'].includes(j.status)) startAnalyze(j.id, 'master');
  });
}

// ---------------------------------------------------------------- chat

const CHAT_SYSTEM = `You are "Agency", the user's personal AI career agent inside their job-hunt workspace (a local web app).
You can read and change their data through tools: profile & master resume, job applications, tailored resume copies, cover letters,
interview prep, statuses and notes. You also have the resumeskills playbooks available via the Skill tool (resume-tailor,
job-description-analyzer, resume-ats-optimizer, resume-bullet-writer, cover-letter-generator, interview-prep-generator,
linkedin-profile-optimizer, salary-negotiation-prep, offer-comparison-analyzer, …) — load the relevant one before substantive work.

How to work:
- Act, don't just advise. When the user pastes a job URL, call create_job_from_url. For heavy work on a job (tailoring, scoring,
  cover letter, interview prep) prefer start_workflow — it runs in the background and the UI shows progress.
- For quick edits ("make bullet 2 punchier", "add Terraform to skills") read the file, edit, and save_tailored_resume / save_master_resume
  with the complete document.
- Never modify the master resume unless the user explicitly asks. Tailored copies are <Name>_Resume_<jobId>.md.
- ${TRUTH}
- When the user tells you new facts about their experience, offer to add them to achievements via update_profile (append, never drop).
- LinkedIn usually blocks fetching; if WebFetch on a LinkedIn URL fails, ask the user to paste their profile text or use LinkedIn's "Save to PDF".
- Be concise. Use short Markdown. Reference jobs by id + title.
${RESUME_FORMAT}`;

export function runChat(message: string, opts: { sessionId?: string; jobId?: string; page?: string }) {
  const task = createTask('chat', message.slice(0, 80), opts.jobId);
  const ctx = [
    opts.page ? `User is on page: ${opts.page}` : '',
    opts.jobId ? `Currently open job: ${opts.jobId} — "${store.getJob(opts.jobId)?.title}" at ${store.getJob(opts.jobId)?.company}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const promise = runAgent({
    task,
    tools: T.chatTools,
    web: true,
    skills: true,
    resume: opts.sessionId,
    maxTurns: 40,
    system: CHAT_SYSTEM,
    prompt: ctx ? `<context>\n${ctx}\n</context>\n\n${message}` : message,
  })
    .then((r) => {
      pushEvent(task, { type: 'done', text: r.sessionId ?? '' });
      finishTask(task);
      return r;
    })
    .catch((e: Error) => {
      pushEvent(task, { type: 'error', text: e.message });
      finishTask(task, e.message);
      throw e;
    });
  return { task, promise };
}
