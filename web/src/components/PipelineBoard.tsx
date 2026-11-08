import { Fragment, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Briefcase, ChevronRight, FileCheck2, Plus, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { band, cx, hostname, STATUS_META } from '../lib/format';
import type { Job, JobStatus } from '../lib/types';
import { Button } from './ui';

const STAGES: JobStatus[] = ['saved', 'applied', 'screening', 'interviewing', 'offer'];
const CLOSED: JobStatus[] = ['rejected', 'withdrawn'];

/** Stage colour used for the stripe/segment; label always accompanies it. */
const STAGE_FILL: Record<JobStatus, string> = {
  saved: 'bg-slate-400',
  applied: 'bg-sky-500',
  screening: 'bg-violet-500',
  interviewing: 'bg-indigo-600',
  offer: 'bg-emerald-500',
  rejected: 'bg-rose-400',
  withdrawn: 'bg-slate-300',
};

function enteredStageAt(j: Job) {
  const s = j.activity.find((a) => a.kind === 'status');
  return s?.at ?? (j.status === 'applied' ? j.appliedAt : undefined) ?? j.createdAt;
}

function daysSince(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400e3);
  return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
}

function nextAction(j: Job): string {
  if (!j.details) return 'Scanning posting';
  if (!j.analysis) return 'Scoring match';
  if (j.status === 'saved') return j.tailored ? 'Ready to submit' : 'Tailor resume';
  if (j.status === 'applied') {
    const days = (Date.now() - new Date(enteredStageAt(j)).getTime()) / 86400e3;
    return days >= 7 ? 'Follow up with recruiter' : 'Waiting on response';
  }
  if (j.status === 'screening') return j.interviewPrep ? 'Prep pack ready' : 'Generate interview prep';
  if (j.status === 'interviewing') return j.interviewPrep ? 'Review STAR stories' : 'Generate interview prep';
  if (j.status === 'offer') return 'Compare & negotiate';
  return '';
}

function MiniRing({ score }: { score?: number }) {
  const b = band(score);
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-10 shrink-0">
      <svg viewBox="0 0 40 40" className="size-10 -rotate-90">
        <circle cx="20" cy="20" r={r} stroke="#eef2f7" strokeWidth="4" fill="none" />
        <circle cx="20" cy="20" r={r} stroke={b.stroke} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={`${((score ?? 0) / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-slate-800">{score ?? '–'}</span>
    </div>
  );
}

function RoleCard({ job, onAdvance }: { job: Job; onAdvance: (j: Job, s: JobStatus) => void }) {
  const best = job.tailored?.analysis ?? job.analysis;
  const b = band(best?.score);
  const idx = STAGES.indexOf(job.status);
  const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : undefined;
  const action = nextAction(job);
  const nav = useNavigate();
  const open = () => nav(`/jobs/${job.id}`);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      className="group relative flex cursor-pointer flex-col outline-none focus-visible:ring-2 focus-visible:ring-brand-500 overflow-hidden rounded-xl border border-slate-200 bg-white pl-4 pr-3.5 pt-3 pb-2.5 transition hover:-translate-y-px hover:border-slate-300 hover:shadow-[0_6px_20px_-8px_rgba(15,23,42,0.18)]"
    >
      <span className={cx('absolute inset-y-0 left-0 w-1', STAGE_FILL[job.status])} aria-hidden />
      <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
        <span className="flex size-5 items-center justify-center rounded bg-slate-100 text-[9.5px] font-bold uppercase text-slate-600">
          {(job.company || hostname(job.url) || '?').slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-slate-600">{job.company || hostname(job.url)}</span>
        <span className="font-mono text-[10.5px] text-slate-500">{job.id}</span>
      </div>

      <div className="mt-2 flex items-start gap-3">
        <h4 className="line-clamp-2 min-h-[2.6em] flex-1 text-[13.5px] font-semibold leading-[1.3] text-slate-900" title={job.title}>
          {job.title}
        </h4>
        <MiniRing score={best?.score} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={cx('font-medium', b.tone)}>{b.label}</span>
        {job.tailored ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-px font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <FileCheck2 className="size-3" /> Tailored
          </span>
        ) : (
          <span className="rounded-full bg-slate-50 px-1.5 py-px text-slate-500 ring-1 ring-inset ring-slate-200">Master only</span>
        )}
        {!!job.duplicates?.length && <span className="rounded-full bg-amber-50 px-1.5 py-px font-medium text-amber-800 ring-1 ring-inset ring-amber-200">Duplicate</span>}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2 text-[11.5px]">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-slate-600">
          <Sparkles className="size-3 shrink-0 text-brand-500" />
          <span className="truncate">{action}</span>
        </span>
        <span className="shrink-0 tabular-nums text-slate-500 group-hover:hidden">{daysSince(enteredStageAt(job))}</span>
        {next && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdvance(job, next);
            }}
            className="hidden shrink-0 items-center gap-0.5 rounded-md bg-slate-900 px-1.5 py-0.5 font-medium text-white group-hover:inline-flex"
            title={`Move to ${STATUS_META[next].label}`}
          >
            {STATUS_META[next].label} <ArrowRight className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function PipelineBoard({ jobs, onNew, onChanged }: { jobs: Job[]; onNew: () => void; onChanged: (jobs: Job[]) => void }) {
  const [stage, setStage] = useState<JobStatus | 'active'>('active');
  const active = jobs.filter((j) => STAGES.includes(j.status));
  const closed = jobs.filter((j) => CLOSED.includes(j.status));
  const count = (s: JobStatus) => jobs.filter((j) => j.status === s).length;

  const weekAgo = Date.now() - 7 * 86400e3;
  const appliedWeek = jobs.filter((j) => j.appliedAt && new Date(j.appliedAt).getTime() > weekAgo).length;
  const submitted = jobs.filter((j) => j.appliedAt || ['screening', 'interviewing', 'offer'].includes(j.status));
  const responded = submitted.filter((j) => ['screening', 'interviewing', 'offer'].includes(j.status));
  const scored = active.map((j) => (j.tailored?.analysis ?? j.analysis)?.score).filter((s): s is number => s != null);
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : undefined;

  const shown = (stage === 'active' ? active : jobs.filter((j) => j.status === stage)).sort(
    (a, b) => STAGES.indexOf(b.status) - STAGES.indexOf(a.status) || b.updatedAt.localeCompare(a.updatedAt),
  );

  const advance = async (job: Job, s: JobStatus) => {
    onChanged(jobs.map((j) => (j.id === job.id ? { ...j, status: s } : j)));
    await api.updateJob(job.id, { status: s });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-20px_rgba(15,23,42,0.25)]">
      {/* ------- summary band ------- */}
      <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white px-5 pt-4 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Application pipeline</h2>
            <p className="text-xs text-slate-500">
              {active.length} active · {closed.length} closed
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-7 gap-y-2">
            {[
              ['Applied this week', String(appliedWeek)],
              ['Response rate', submitted.length ? `${Math.round((responded.length / submitted.length) * 100)}%` : '—'],
              ['Avg best match', avg != null ? `${avg}%` : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums leading-tight text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* stage track */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 @2xl:flex @2xl:items-stretch @2xl:gap-0">
          {STAGES.map((s, i) => {
            const n = count(s);
            const on = stage === s;
            return (
              <Fragment key={s}>
                {i > 0 && <ChevronRight className="mx-0.5 hidden size-4 shrink-0 self-center text-slate-300 @2xl:block" aria-hidden />}
                <button
                  onClick={() => setStage(on ? 'active' : s)}
                  aria-pressed={on}
                  className={cx(
                    'group min-w-0 flex-1 rounded-xl px-3 py-2 text-left ring-1 ring-inset transition',
                    on ? 'bg-slate-900 ring-slate-900' : n ? 'bg-white ring-slate-200 hover:ring-slate-300' : 'bg-transparent ring-transparent hover:bg-white hover:ring-slate-200',
                  )}
                >
                  <div className={cx('flex items-center gap-1.5 truncate text-[11px] font-medium', on ? 'text-slate-300' : 'text-slate-500')}>
                    <span className={cx('size-1.5 shrink-0 rounded-full', STAGE_FILL[s])} />
                    {STATUS_META[s].label}
                  </div>
                  <div className={cx('mt-0.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums', on ? 'text-white' : n ? 'text-slate-900' : 'text-slate-300')}>{n}</div>
                  {/* share of active roles in this stage */}
                  <div className={cx('mt-2 h-1 overflow-hidden rounded-full', on ? 'bg-white/15' : 'bg-slate-100')} title={active.length ? `${Math.round((n / active.length) * 100)}% of active roles` : undefined}>
                    <div className={cx('h-full rounded-full', STAGE_FILL[s])} style={{ width: active.length ? `${(n / active.length) * 100}%` : 0 }} />
                  </div>
                </button>
              </Fragment>
            );
          })}
        </div>

      </div>

      {/* ------- role cards ------- */}
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="text-xs font-medium text-slate-500">
            {stage === 'active' ? 'All active roles, furthest along first' : `${STATUS_META[stage].label} · ${shown.length}`}
            {stage !== 'active' && (
              <button onClick={() => setStage('active')} className="ml-2 text-brand-600 hover:underline">
                Show all
              </button>
            )}
          </div>
          {closed.length > 0 && (
            <Link to="/applications" className="text-xs text-slate-500 hover:text-slate-700">
              {CLOSED.map((s) => `${count(s)} ${STATUS_META[s].label.toLowerCase()}`).join(' · ')} →
            </Link>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 py-10 text-center">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Briefcase className="size-5" />
            </div>
            <div className="text-sm font-medium text-slate-800">{stage === 'active' ? 'No active roles yet' : `Nothing in ${STATUS_META[stage as JobStatus].label}`}</div>
            <p className="mt-1 max-w-xs text-xs text-slate-500">Paste a job link and the agent scans it, scores your fit and drafts a tailored resume.</p>
            <Button className="mt-3" size="sm" variant="ai" icon={<Plus className="size-3.5" />} onClick={onNew}>
              Add a role
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
            {shown.map((j) => (
              <RoleCard key={j.id} job={j} onAdvance={advance} />
            ))}
            <button
              onClick={onNew}
              className="flex min-h-[150px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-500 transition hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700"
            >
              <Plus className="size-4" /> Track another role
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
