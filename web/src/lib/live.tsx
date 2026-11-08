import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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

  useEffect(() => localStorage.setItem('agentOpen', agentOpen ? '1' : '0'), [agentOpen]);

  useEffect(() => {
    api.tasks().then(setTasks).catch(() => {});
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      const m = JSON.parse(e.data) as Msg;
      if (m.type === 'task') {
        setTasks((prev) => [m.task, ...prev.filter((t) => t.id !== m.task.id)].slice(0, 60));
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
    <Ctx.Provider value={{ tasks, taskEvents, subscribe, agentOpen, setAgentOpen, askAgent, pendingPrompt }}>
      {children}
    </Ctx.Provider>
  );
}

export const useLive = () => useContext(Ctx);

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
