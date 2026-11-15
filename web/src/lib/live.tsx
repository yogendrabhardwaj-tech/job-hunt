import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { api } from './api';
import type { AgentEvent, Job, Profile, TaskSummary } from './types';

type Msg =
  | { type: 'hello' }
  | { type: 'task'; task: TaskSummary }
  | { type: 'task-event'; taskId: string; event: AgentEvent }
  | { type: 'job'; jobId: string }
  | { type: 'profile' };

interface LiveCtx {
  tasks: TaskSummary[];
  taskEvents: Record<string, AgentEvent[]>;
  subscribe: (fn: (m: Msg) => void) => () => void;
  agentOpen: boolean;
  setAgentOpen: (v: boolean) => void;
  askAgent: (prompt: string, opts?: { send?: boolean }) => void;
  pendingPrompt: { text: string; send: boolean; n: number } | null;
  /** Jobs whose scan the user sent to the background: no overlay, and a notice when it finishes. */
  backgroundScans: Set<string>;
  sendScanToBackground: (jobId: string) => void;
}

/** Remembered for the tab, so a reload doesn't bring the overlay back for a scan already in the background. */
export const BG_SCANS_KEY = 'agency.bgScans';

interface ScanNotice {
  jobId: string;
  title: string;
  ok: boolean;
  n: number;
}

const Ctx = createContext<LiveCtx>(null!);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [taskEvents, setTaskEvents] = useState<Record<string, AgentEvent[]>>({});
  const [agentOpen, setAgentOpen] = useState(() => {
    const saved = localStorage.getItem('agentOpen');
    return saved ? saved === '1' : window.innerWidth >= 1280;
  });
  const [pendingPrompt, setPending] = useState<LiveCtx['pendingPrompt']>(null);
  const subs = useRef(new Set<(m: Msg) => void>());
  const [backgroundScans, setBg] = useState<Set<string>>(() => new Set(JSON.parse(sessionStorage.getItem(BG_SCANS_KEY) || '[]')));
  const bgRef = useRef(backgroundScans);
  const [notices, setNotices] = useState<ScanNotice[]>([]);

  const saveBg = (next: Set<string>) => {
    bgRef.current = next;
    setBg(next);
    sessionStorage.setItem(BG_SCANS_KEY, JSON.stringify([...next]));
  };
  const sendScanToBackground = useCallback((jobId: string) => saveBg(new Set(bgRef.current).add(jobId)), []);

  // a scan the user sent to the background has finished: say so, wherever they are in the app
  const scanFinished = useCallback((jobId: string, ok: boolean) => {
    if (!bgRef.current.has(jobId)) return;
    const next = new Set(bgRef.current);
    next.delete(jobId);
    saveBg(next);
    api
      .job(jobId)
      .then((j) => j.title)
      .catch(() => 'your new role')
      .then((title) => setNotices((prev) => [...prev.filter((x) => x.jobId !== jobId), { jobId, title, ok, n: Date.now() }]));
  }, []);

  useEffect(() => localStorage.setItem('agentOpen', agentOpen ? '1' : '0'), [agentOpen]);

  useEffect(() => {
    api.tasks().then(setTasks).catch(() => {});
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      const m = JSON.parse(e.data) as Msg;
      if (m.type === 'task') {
        setTasks((prev) => [m.task, ...prev.filter((t) => t.id !== m.task.id)].slice(0, 60));
        if (m.task.kind === 'scan' && m.task.jobId && m.task.state !== 'running') scanFinished(m.task.jobId, m.task.state === 'done');
      } else if (m.type === 'task-event') {
        setTaskEvents((prev) => {
          const list = prev[m.taskId] ? [...prev[m.taskId]] : [];
          const last = list[list.length - 1];
          if (m.event.type === 'text' && last?.type === 'text') list[list.length - 1] = { ...last, text: last.text + m.event.text };
          else list.push(m.event);
          return { ...prev, [m.taskId]: list };
        });
      }
      subs.current.forEach((fn) => fn(m));
    };
    return () => es.close();
  }, []);

  const subscribe = useCallback((fn: (m: Msg) => void) => {
    subs.current.add(fn);
    return () => void subs.current.delete(fn);
  }, []);

  const askAgent = useCallback((text: string, opts?: { send?: boolean }) => {
    setAgentOpen(true);
    setPending((p) => ({ text, send: opts?.send ?? false, n: (p?.n ?? 0) + 1 }));
  }, []);

  return (
    <Ctx.Provider value={{ tasks, taskEvents, subscribe, agentOpen, setAgentOpen, askAgent, pendingPrompt, backgroundScans, sendScanToBackground }}>
      {children}
      <ScanNotices notices={notices} dismiss={(jobId) => setNotices((prev) => prev.filter((x) => x.jobId !== jobId))} />
    </Ctx.Provider>
  );
}

export const useLive = () => useContext(Ctx);

/** Notices for background scans that finished, bottom-left so they don't cover the copilot. */
function ScanNotices({ notices, dismiss }: { notices: ScanNotice[]; dismiss: (jobId: string) => void }) {
  // finished scans fade out on their own after a while; failures stay until dismissed
  useEffect(() => {
    const timers = notices.filter((x) => x.ok).map((x) => setTimeout(() => dismiss(x.jobId), 12_000));
    return () => timers.forEach(clearTimeout);
  }, [notices, dismiss]);
  if (!notices.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      {notices.map((x) => (
        <div key={x.jobId} className="pointer-events-auto flex items-start gap-3 rounded-xl bg-white p-3.5 shadow-xl ring-1 ring-slate-200">
          {x.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">{x.ok ? 'Role scanned' : 'The scan didn’t finish'}</div>
            <div className="truncate text-xs text-slate-600">{x.title}</div>
            <Link to={`/jobs/${x.jobId}`} onClick={() => dismiss(x.jobId)} className="mt-1.5 inline-block text-xs font-medium text-brand-700 hover:underline">
              {x.ok ? 'Open the role' : 'See what happened'}
            </Link>
          </div>
          <button aria-label="Dismiss" onClick={() => dismiss(x.jobId)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Fetch something and refetch whenever a matching live event arrives. */
function useLiveQuery<T>(fetcher: () => Promise<T>, match: (m: Msg) => boolean, deps: unknown[]) {
  const { subscribe } = useLive();
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string>();
  const reload = useCallback(() => {
    fetcher()
      .then((d) => {
        setData(d);
        setError(undefined);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
    return subscribe((m) => match(m) && reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);
  return { data, error, reload, setData };
}

export const useJobs = () => useLiveQuery<Job[]>(api.jobs, (m) => m.type === 'job' || (m.type === 'task' && m.task.state !== 'running'), []);
export const useJob = (id: string) =>
  useLiveQuery<Job>(() => api.job(id), (m) => (m.type === 'job' && m.jobId === id) || (m.type === 'task' && m.task.jobId === id), [id]);
export const useProfile = () =>
  useLiveQuery<{ profile: Profile; master: string }>(api.profile, (m) => m.type === 'profile' || (m.type === 'task' && m.task.kind === 'import-resume'), []);
export const useResume = (file?: string) =>
  useLiveQuery<{ file: string; content: string }>(
    () => (file ? api.resume(file) : Promise.resolve({ file: '', content: '' })),
    (m) => m.type === 'job' || m.type === 'profile',
    [file],
  );

export function useJobTasks(jobId?: string) {
  const { tasks, taskEvents } = useLive();
  const running = tasks.filter((t) => t.jobId === jobId && t.state === 'running' && t.kind !== 'chat');
  return { running, taskEvents, latest: tasks.find((t) => t.jobId === jobId && t.kind !== 'chat') };
}
