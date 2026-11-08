import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import * as store from './store.ts';
import { bus, getTask, listTasks, type BusMessage } from './tasks.ts';
import { fileToText, guessPostingId } from './extract.ts';
import * as providers from './llm/providers.ts';
import { listModels, testProvider } from './llm/openai.ts';
import * as wf from './workflows.ts';
import { JOB_STATUSES, type Job, type JobStatus } from './types.ts';

const app = express();
app.use(express.json({ limit: '5mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const wrap =
  (fn: (req: Request, res: Response) => unknown) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  };
const param = (req: Request, k: string) => String(req.params[k]);

// ---------------------------------------------------------------- live events (SSE)

app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
  const on = (m: BusMessage) => res.write(`data: ${JSON.stringify(m)}\n\n`);
  bus.on('msg', on);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => {
    bus.off('msg', on);
    clearInterval(ping);
  });
});

app.get('/api/meta', (_req, res) => res.json({ model: providers.summary(), statuses: JOB_STATUSES }));
app.get('/api/tasks', (_req, res) => res.json(listTasks()));
app.get('/api/tasks/:id', (req, res) => {
  const t = getTask(param(req, 'id'));
  t ? res.json(t) : res.status(404).json({ error: 'not found' });
});

// ---------------------------------------------------------------- AI sources (settings)

app.get('/api/settings', (_req, res) => res.json(providers.publicSettings()));
app.put(
  '/api/settings',
  wrap((req, res) => {
    if (req.body?.strategy) providers.setStrategy(req.body.strategy);
    if (Array.isArray(req.body?.order)) providers.reorder(req.body.order.map(String));
    res.json(providers.publicSettings());
  }),
);
app.post(
  '/api/settings/providers',
  wrap((req, res) => {
    providers.addProvider(req.body ?? {});
    res.json(providers.publicSettings());
  }),
);
app.put(
  '/api/settings/providers/:id',
  wrap((req, res) => {
    providers.updateProvider(param(req, 'id'), req.body ?? {});
    res.json(providers.publicSettings());
  }),
);
app.delete('/api/settings/providers/:id', (req, res) => {
  providers.removeProvider(param(req, 'id'));
  res.json(providers.publicSettings());
});
/** Lists a source's models. Works for unsaved forms too: typed values win, then the stored source's key. */
app.post(
  '/api/settings/models',
  wrap(async (req, res) => {
    const saved = req.body?.id ? providers.getProvider(String(req.body.id)) : undefined;
    const kind = saved?.kind ?? req.body?.kind;
    if (!kind) throw new Error('Source type required');
    const baseUrl = String(req.body?.baseUrl || saved?.baseUrl || '').replace(/\/+$/, '');
    res.json(await listModels({ kind, baseUrl, apiKey: String(req.body?.apiKey || saved?.apiKey || '') }));
  }),
);
app.post(
  '/api/settings/providers/:id/test',
  wrap(async (req, res) => {
    const p = providers.getProvider(param(req, 'id'));
    if (!p) throw new Error('Source not found');
    if (p.kind === 'claude') throw new Error('Claude uses your claude CLI login; there is nothing to test here');
    res.json(await testProvider(p));
  }),
);

// ---------------------------------------------------------------- profile & resumes

app.get('/api/profile', (_req, res) => res.json({ profile: store.getProfile(), master: store.readMaster() }));
app.put(
  '/api/profile',
  wrap((req, res) => {
    const allowed = ['name', 'email', 'phone', 'location', 'headline', 'linkedinUrl', 'linkedinText', 'achievements', 'targetRoles'];
    const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    res.json(store.updateProfile(patch));
  }),
);

app.post(
  '/api/profile/import',
  upload.single('file'),
  wrap(async (req, res) => {
    let text = String(req.body.text ?? '');
    if (req.file) {
      fs.writeFileSync(path.join(store.UPLOAD_DIR, `${Date.now()}_${req.file.originalname.replace(/[^\w.-]/g, '_')}`), req.file.buffer);
      text = await fileToText(req.file.buffer, req.file.originalname);
    }
    if (text.trim().length < 100) throw new Error('Could not read enough text from that resume');
    res.json({ task: wf.startImportResume(text) });
  }),
);

/** LinkedIn "Save to PDF" export — stored as text context for the agent. */
app.post(
  '/api/profile/linkedin',
  upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) throw new Error('No file');
    const text = await fileToText(req.file.buffer, req.file.originalname);
    res.json(store.updateProfile({ linkedinText: text.trim() }));
  }),
);

app.get('/api/resumes', (_req, res) => res.json(store.listResumeFiles()));
app.get('/api/resumes/:file', wrap((req, res) => res.json({ file: param(req, 'file'), content: store.readResume(param(req, 'file')) })));
app.put(
  '/api/resumes/:file',
  wrap((req, res) => {
    store.writeResume(param(req, 'file'), String(req.body.content ?? ''));
    res.json({ ok: true });
  }),
);
app.get(
  '/api/resumes/:file/download',
  wrap((req, res) => res.download(store.resumePath(param(req, 'file')))),
);

// ---------------------------------------------------------------- jobs

// duplicates are computed on read so warnings disappear when the original is deleted
const withDuplicates = (j: Job) => ({ ...j, duplicates: store.findDuplicates(j) });

app.get('/api/jobs', (_req, res) => res.json(store.listJobs().map(withDuplicates)));
app.get('/api/jobs/:id', (req, res) => {
  const j = store.getJob(param(req, 'id'));
  j ? res.json(withDuplicates(j)) : res.status(404).json({ error: 'not found' });
});

/** Pre-flight check used by the "New role" dialog before a record is created. */
app.post(
  '/api/jobs/check',
  wrap((req, res) => {
    const url = String(req.body.url ?? '').trim();
    if (!url) return void res.json({ duplicates: [] });
    new URL(url);
    res.json({ postingId: guessPostingId(url), duplicates: store.findDuplicates({ url, postingId: guessPostingId(url) }) });
  }),
);

app.post(
  '/api/jobs',
  wrap((req, res) => {
    const url = String(req.body.url ?? '').trim();
    const jdText = String(req.body.jdText ?? '').trim();
    if (!url && !jdText) throw new Error('Provide a job URL or paste the description');
    if (url) new URL(url); // validate
    const job = store.createJob({ url, jdText });
    wf.startScan(job.id);
    res.json(job);
  }),
);

app.patch(
  '/api/jobs/:id',
  wrap((req, res) => {
    const id = param(req, 'id');
    const { status, notes, title, company, location, salary } = req.body;
    if (status && !JOB_STATUSES.includes(status)) throw new Error('bad status');
    const before = store.getJob(id);
    if (!before) throw new Error('not found');
    const job = store.updateJob(id, (j) => {
      if (status) {
        j.status = status as JobStatus;
        if (status === 'applied' && !j.appliedAt) j.appliedAt = store.now();
      }
      for (const [k, v] of Object.entries({ notes, title, company, location, salary })) if (typeof v === 'string') (j as any)[k] = v;
    });
    if (status && status !== before.status) store.logActivity(id, `Status → ${status}`, 'status');
    res.json(job);
  }),
);

app.delete('/api/jobs/:id', (req, res) => {
  store.deleteJob(param(req, 'id'));
  res.json({ ok: true });
});

app.post(
  '/api/jobs/:id/:action',
  wrap((req, res) => {
    const id = param(req, 'id');
    if (!store.getJob(id)) throw new Error('not found');
    const instr = req.body?.instructions ? String(req.body.instructions) : undefined;
    const action = param(req, 'action');
    const task =
      action === 'rescan'
        ? (store.updateJob(id, (j) => void (req.body?.jdText ? (j.jdText = String(req.body.jdText)) : null)), wf.startScan(id))
        : action === 'analyze'
          ? wf.startAnalyze(id, req.body?.target === 'tailored' ? 'tailored' : 'master')
          : action === 'tailor'
            ? wf.startTailor(id, instr)
            : action === 'cover-letter'
              ? wf.startCoverLetter(id, instr)
              : action === 'interview-prep'
                ? wf.startInterviewPrep(id, instr)
                : null;
    if (!task) throw new Error(`Unknown action ${action}`);
    res.json({ task });
  }),
);

// ---------------------------------------------------------------- agent chat (streams the task's events as SSE)

app.post('/api/chat', (req, res) => {
  const { message, sessionId, jobId, page } = req.body ?? {};
  if (!message) return void res.status(400).json({ error: 'message required' });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const { task, promise } = wf.runChat(String(message), { sessionId, jobId, page });
  const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  send({ type: 'task', taskId: task.id });
  const on = (m: BusMessage) => {
    if (m.type === 'task-event' && m.taskId === task.id) send(m.event);
  };
  bus.on('msg', on);
  promise
    .then((r) => send({ type: 'session', sessionId: r.sessionId }))
    .catch(() => {})
    .finally(() => {
      bus.off('msg', on);
      res.end();
    });
});

// ---------------------------------------------------------------- static (production build)

const dist = path.join(store.ROOT, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// One-time migration: bring tailored copies in line with the current naming
// (<Name>_Resume_<appId>_<postingId>.md) — e.g. after the posting-ID suffix was introduced.
for (const job of store.listJobs()) {
  const cur = job.tailored?.file;
  const want = store.tailoredFileName(job.id);
  if (!cur || cur === want || !fs.existsSync(store.resumePath(cur)) || fs.existsSync(store.resumePath(want))) continue;
  fs.renameSync(store.resumePath(cur), store.resumePath(want));
  store.updateJob(job.id, (j) => void (j.tailored!.file = want));
  for (const a of [job.analysis, job.tailored?.analysis]) if (a?.resumeFile === cur) a.resumeFile = want;
  store.logActivity(job.id, `Tailored resume renamed to ${want}`);
  console.log(`  renamed ${cur} → ${want}`);
}

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Job Hunt Agency API → http://localhost:${PORT}  (AI: ${providers.summary()})\n`);
});
