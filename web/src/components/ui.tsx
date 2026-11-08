import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { band, cx, STATUS_META, STATUSES } from '../lib/format';
import type { JobStatus } from '../lib/types';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  const v: Record<Variant, string> = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
    secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50',
    ai: 'text-white shadow-sm bg-gradient-to-b from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-700 ring-1 ring-inset ring-white/10',
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        v[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-2', className)}>
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{children}</h3>
      {right}
    </div>
  );
}

export function StatusPill({ status }: { status: JobStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', m.pill)}>
      <span className={cx('size-1.5 shrink-0 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

export function StatusSelect({ value, onChange, className }: { value: JobStatus; onChange: (s: JobStatus) => void; className?: string }) {
  const m = STATUS_META[value];
  return (
    <label className={cx('relative inline-flex cursor-pointer items-center', className)} onClick={(e) => e.stopPropagation()}>
      <span className={cx('pointer-events-none absolute left-2.5 size-1.5 rounded-full', m.dot)} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as JobStatus)}
        className={cx('h-7 cursor-pointer appearance-none rounded-full py-0 pl-6 pr-6 text-xs font-medium ring-1 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-brand-500', m.pill)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 size-3 opacity-60" viewBox="0 0 12 12">
        <path d="M3 4.5l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.5" />
      </svg>
    </label>
  );
}

/** Single hero metric: ring + number. Band label carries meaning in text, not color alone. */
export function ScoreRing({ score, size = 76, label, sub }: { score?: number; size?: number; label?: string; sub?: string }) {
  const b = band(score);
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="#eef2f7" strokeWidth="6" fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={b.stroke}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            style={{ transition: 'stroke-dasharray 700ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[19px] font-semibold tabular-nums tracking-tight text-slate-900" style={{ fontSize: size * 0.25 }}>
            {score == null ? '—' : `${score}`}
            {score != null && <span className="text-[0.55em] font-medium text-slate-500">%</span>}
          </span>
        </div>
      </div>
      {(label || sub) && (
        <div className="min-w-0 whitespace-nowrap">
          {label && <div className="text-xs font-medium text-slate-500">{label}</div>}
          <div className={cx('text-sm font-semibold', b.tone)}>{sub ?? b.label}</div>
        </div>
      )}
    </div>
  );
}

export function MeterRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="grid grid-cols-[84px_minmax(60px,1fr)_28px] items-center gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${value ?? 0}%` }} />
      </div>
      <span className="text-right font-medium tabular-nums text-slate-700">{value ?? '—'}</span>
    </div>
  );
}

export function MiniBar({ score }: { score?: number }) {
  const b = band(score);
  if (score == null) return <span className="text-xs text-slate-500">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full', b.bar)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-8 text-xs font-semibold tabular-nums text-slate-700">{score}%</span>
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {body && <div className="mt-1 max-w-sm text-sm text-slate-500">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('shimmer rounded-md', className)} />;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition',
            value === it.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export const inputCls =
  'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 outline-none';
