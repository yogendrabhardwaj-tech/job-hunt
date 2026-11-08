import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type { AgentEvent, Task, TaskKind } from './types.ts';
import { now } from './store.ts';

/** Single in-process event bus; the web UI subscribes via SSE at /api/events. */
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export type BusMessage =
  | { type: 'task'; task: Omit<Task, 'events'> }
  | { type: 'task-event'; taskId: string; event: AgentEvent }
  | { type: 'job'; jobId: string }
  | { type: 'profile' };

export const emit = (m: BusMessage) => bus.emit('msg', m);

const tasks = new Map<string, Task>();

const summary = ({ events: _e, ...t }: Task) => t;

export function listTasks() {
  return [...tasks.values()].map(summary).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getTask(id: string) {
  return tasks.get(id);
}

export function findRunning(kind: TaskKind, jobId?: string) {
  return [...tasks.values()].find((t) => t.state === 'running' && t.kind === kind && t.jobId === jobId);
}

export function createTask(kind: TaskKind, title: string, jobId?: string): Task {
  const task: Task = { id: nanoid(10), kind, jobId, title, state: 'running', startedAt: now(), events: [] };
  tasks.set(task.id, task);
  // keep memory bounded
  if (tasks.size > 60) {
    const oldest = [...tasks.values()].filter((t) => t.state !== 'running').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    for (const t of oldest.slice(0, tasks.size - 60)) tasks.delete(t.id);
  }
  emit({ type: 'task', task: summary(task) });
  return task;
}

export function pushEvent(task: Task, e: Omit<AgentEvent, 'at'>) {
  const event = { ...e, at: now() };
  // coalesce streaming text so stored history stays compact
  const last = task.events[task.events.length - 1];
  if (e.type === 'text' && last?.type === 'text') last.text += e.text;
  else task.events.push(event);
  emit({ type: 'task-event', taskId: task.id, event });
}

export function finishTask(task: Task, error?: string) {
  task.state = error ? 'error' : 'done';
  task.error = error;
  task.endedAt = now();
  emit({ type: 'task', task: summary(task) });
}
