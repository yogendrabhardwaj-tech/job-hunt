import { useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { AlertTriangle, Briefcase, ExternalLink, FileCheck2, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useJobs, useLive } from '../lib/live';
import { api } from '../lib/api';
import { PageHeader } from '../components/Layout';
import { Button, Card, Empty, MiniBar, StatusSelect, inputCls } from '../components/ui';
import { STATUS_META, STATUSES, cx, hostname, timeAgo } from '../lib/format';
import type { Job, JobStatus } from '../lib/types';

/** Drop parenthetical asides like "(location not specified; travel 0–50%)" for the compact list. */
const brief = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim();

export function Applications() {
  const { data: jobs, setData } = useJobs();
  const { tasks } = useLive();
  const { openNew } = useOutletContext<{ openNew: () => void }>();
  const nav = useNavigate();
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'match'>('recent');

  const rows = useMemo(() => {
    let r = (jobs ?? []).filter((j) => filter === 'all' || j.status === filter);
    if (q) {
      const s = q.toLowerCase();
      r = r.filter((j) => `${j.title} ${j.company} ${j.location} ${j.id}`.toLowerCase().includes(s));
    }
    if (sort === 'match') r = [...r].sort((a, b) => (b.tailored?.analysis?.score ?? b.analysis?.score ?? -1) - (a.tailored?.analysis?.score ?? a.analysis?.score ?? -1));
    return r;
  }, [jobs, filter, q, sort]);

  const setStatus = async (id: string, status: JobStatus) => {
    setData((prev) => prev?.map((j) => (j.id === id ? { ...j, status } : j)));
    await api.updateJob(id, { status });
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete ${id} and its tailored resume?`)) return;
    setData((prev) => prev?.filter((j) => j.id !== id));
    await api.deleteJob(id);
  };

  const count = (s: JobStatus | 'all') => (s === 'all' ? jobs?.length : jobs?.filter((j) => j.status === s).length) ?? 0;

  return (
    <div className="mx-auto max-w-[1180px] px-4 sm:px-6 py-8">
      <PageHeader
        title="Applications"
        sub="Every role you're tracking, with match scores for your master and tailored resumes."
        right={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
            New role
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cx(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                filter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {s === 'all' ? 'All' : STATUS_META[s].label}
              <span className="ml-1 tabular-nums text-slate-500">{count(s)}</span>
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search role, company, ID…" className={inputCls + ' h-9 pl-8'} />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="h-9 rounded-lg bg-white px-2.5 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="recent">Most recent</option>
            <option value="match">Best match</option>
          </select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {jobs && rows.length === 0 ? (
          <Empty
            icon={<Briefcase className="size-5" />}
            title={jobs.length ? 'No roles match this filter' : 'No applications yet'}
            body={jobs.length ? undefined : 'Paste a job link — the agent creates the record, scans the posting and scores your resume.'}
            action={!jobs.length && <Button variant="ai" icon={<Plus className="size-4" />} onClick={openNew}>Add a role</Button>}
          />
        ) : (
          <>
          {/* narrow containers: stacked cards so the role title never collapses */}
          <ul className="divide-y divide-slate-100 @2xl:hidden">
            {rows.map((j) => {
              const busy = tasks.find((t) => t.jobId === j.id && t.state === 'running' && t.kind !== 'chat');
              const meta = [j.company, brief(j.location)].filter(Boolean).join(' · ') || hostname(j.url);
              return (
                <li key={j.id}>
                  <Link to={`/jobs/${j.id}`} className="block px-4 py-3.5 hover:bg-slate-50/80">
                    <div className="flex items-start justify-between gap-3">
                      <span className="line-clamp-2 font-medium leading-snug text-slate-900">{j.title}</span>
                      <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-px font-mono text-[10.5px] text-slate-500">{j.id}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">{meta}</div>
                    {!!j.duplicates?.length && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-px text-[10.5px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                        <AlertTriangle className="size-3" /> Duplicate of {j.duplicates.map((d) => d.id).join(', ')}
                      </div>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <StatusSelect value={j.status} onChange={(st) => setStatus(j.id, st)} />
                      {busy && !j.analysis ? (
                        <span className="flex items-center gap-1.5 text-xs text-brand-600">
                          <Loader2 className="size-3.5 shrink-0 animate-spin" /> {busy.title}
                        </span>
                      ) : (
                        <>
                          <MiniBar score={j.analysis?.score} />
                          <TailoredLine job={j} />
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <table className="hidden w-full table-fixed text-sm @2xl:table">
            <colgroup>
              <col />
              <col className="w-[150px]" />
              <col className="w-[150px]" />
              <col className="w-[64px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11.5px] font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5">Role</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" title="Master resume match → tailored copy match">Match</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const busy = tasks.find((t) => t.jobId === j.id && t.state === 'running' && t.kind !== 'chat');
                const meta = [j.company, brief(j.location), brief(j.salary)].filter(Boolean).join(' · ') || hostname(j.url);
                return (
                  <tr key={j.id} onClick={() => nav(`/jobs/${j.id}`)} className="group cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold uppercase text-slate-600">
                          {(j.company || hostname(j.url) || '?').slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className="line-clamp-2 min-w-0 font-medium leading-snug text-slate-900" title={j.title}>
                              {j.title}
                            </span>
                            <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-px font-mono text-[10.5px] text-slate-500">{j.id}</span>
                            {!!j.duplicates?.length && (
                              <span
                                title={j.duplicates.map((d) => `Duplicate of ${d.id}: ${d.reason}`).join('\n')}
                                className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded bg-amber-50 px-1.5 py-px text-[10.5px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
                              >
                                <AlertTriangle className="size-3" /> Dup {j.duplicates.map((d) => d.id).join(', ')}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-slate-500" title={[j.company, j.location, j.salary].filter(Boolean).join(' · ')}>
                            {meta}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3">
                      <StatusSelect value={j.status} onChange={(s) => setStatus(j.id, s)} />
                      <div className="mt-1 pl-1 text-[11px] text-slate-500">added {timeAgo(j.createdAt)}</div>
                    </td>
                    <td className="px-3">
                      {busy && !j.analysis ? (
                        <span className="flex items-center gap-1.5 truncate text-xs text-brand-600">
                          <Loader2 className="size-3.5 shrink-0 animate-spin" /> {busy.title}
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <MiniBar score={j.analysis?.score} />
                          <TailoredLine job={j} />
                        </div>
                      )}
                    </td>
                    <td className="pr-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-40 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                        {j.url && (
                          <a href={j.url} target="_blank" rel="noreferrer" className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800" title="Open posting">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                        <button onClick={() => remove(j.id)} className="rounded p-1.5 text-slate-500 hover:bg-rose-100 hover:text-rose-700" title="Delete">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Tip: open a role for the side-by-side match view. <Link to="/resumes" className="underline">Resume library</Link> lists every tailored copy.
      </p>
    </div>
  );
}

function TailoredLine({ job }: { job: Job }) {
  return job.tailored ? (
    <div className="flex items-center gap-1 text-[11px] text-slate-500" title={job.tailored.file}>
      <FileCheck2 className="size-3 text-emerald-600" />
      Tailored{' '}
      <span className="font-semibold tabular-nums text-slate-700">
        {job.tailored.analysis ? `${job.tailored.analysis.score}%` : '…'}
      </span>
      {job.tailored.analysis && job.analysis && job.tailored.analysis.score !== job.analysis.score && (
        <span className={job.tailored.analysis.score > job.analysis.score ? 'text-emerald-700' : 'text-rose-700'}>
          ({job.tailored.analysis.score > job.analysis.score ? '+' : ''}
          {job.tailored.analysis.score - job.analysis.score})
        </span>
      )}
    </div>
  ) : (
    <div className="text-[11px] text-slate-500">Not tailored</div>
  );
}
