import { CheckCircle2, CircleAlert, Loader2, Sparkles, Wrench } from 'lucide-react';
import { useLive } from '../lib/live';
import type { TaskSummary } from '../lib/types';
import { cx } from '../lib/format';

/** Compact live view of an agent task: tool steps + last line of narration. */
export function TaskLog({ task, compact }: { task: TaskSummary; compact?: boolean }) {
  const { taskEvents } = useLive();
  const events = (taskEvents[task.id] ?? []).filter((e) => e.type !== 'done');
  const steps = events.filter((e) => e.type !== 'text');
  const narration = [...events].reverse().find((e) => e.type === 'text')?.text.trim();
  const shown = compact ? steps.slice(-3) : steps;

  return (
    <div className="rounded-xl border border-brand-100 bg-gradient-to-b from-brand-50/70 to-white p-3">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
        {task.state === 'running' ? (
          <Loader2 className="size-4 animate-spin text-brand-600" />
        ) : task.state === 'error' ? (
          <CircleAlert className="size-4 text-rose-600" />
        ) : (
          <CheckCircle2 className="size-4 text-emerald-600" />
        )}
        <span>{task.title}</span>
        <span className="text-xs font-normal text-slate-500">{task.state === 'running' ? 'Agent working…' : task.state === 'error' ? 'Failed' : 'Done'}</span>
      </div>
      {shown.length > 0 && (
        <ol className="mt-2 space-y-1 border-l border-brand-200 pl-3">
          {shown.map((e, i) => (
            <li key={i} className={cx('flex items-start gap-1.5 text-xs', e.type === 'error' ? 'text-rose-700' : 'text-slate-600')}>
              {e.type === 'tool' ? <Wrench className="mt-0.5 size-3 shrink-0 text-brand-500" /> : <Sparkles className="mt-0.5 size-3 shrink-0 text-slate-500" />}
              <span className="break-words">{e.text}</span>
            </li>
          ))}
        </ol>
      )}
      {narration && task.state === 'running' && (
        <p className="mt-2 line-clamp-2 text-xs italic text-slate-500">{narration.slice(-220)}</p>
      )}
      {task.error && <p className="mt-2 text-xs text-rose-700">{task.error}</p>}
    </div>
  );
}
