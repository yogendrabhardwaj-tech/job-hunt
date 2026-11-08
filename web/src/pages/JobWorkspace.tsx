import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { diffWords } from 'diff';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Flag,
  GraduationCap,
  Highlighter,
  Lightbulb,
  Mail,
  MessageSquare,
  Pencil,
  Printer,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-react';
import { useJob, useJobTasks, useLive, useProfile, useResume } from '../lib/live';
import { api } from '../lib/api';
import { buildMatcher, splitText, type Term } from '../lib/highlight';
import { cx, hostname, timeAgo } from '../lib/format';
import { Md, ResumeView } from '../components/Markdown';
import { TaskLog } from '../components/TaskLog';
import { Button, Card, Empty, MeterRow, ScoreRing, SectionTitle, Skeleton, StatusSelect, Tabs, inputCls } from '../components/ui';
import type { Analysis, Job } from '../lib/types';

type Tab = 'match' | 'resume' | 'cover' | 'prep' | 'notes';

export function JobWorkspace() {
  const { id = '' } = useParams();
  const { data: job, error, setData } = useJob(id);
  const { running } = useJobTasks(id);
  const [tab, setTab] = useState<Tab>('match');
  const [tailorOpen, setTailorOpen] = useState(false);
  const [instr, setInstr] = useState('');

  if (error) return <div className="p-8 text-sm text-rose-600">{error}</div>;
  if (!job) return <WorkspaceSkeleton />;

  const tailoring = running.some((t) => t.kind === 'tailor');
  const scanning = running.some((t) => t.kind === 'scan');
  const analyzing = running.some((t) => t.kind === 'analyze');

  const tailor = async () => {
    setTailorOpen(false);
    await api.action(job.id, 'tailor', { instructions: instr || undefined });
    setInstr('');
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
      <Link to="/applications" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-3.5" /> Applications
      </Link>

      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">{job.id}</span>
            {job.postingId && <span className="font-mono text-[11px] text-slate-500">req #{job.postingId}</span>}
          </div>
          <h1 className="mt-1.5 text-[24px] font-semibold tracking-tight text-slate-900">{job.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {job.company && <span className="font-medium text-slate-700">{job.company}</span>}
            {job.location && <span>{job.location}</span>}
            {job.employmentType && <span>{job.employmentType}</span>}
            {job.salary && <span className="text-emerald-700">{job.salary}</span>}
            {job.url && (
              <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                {hostname(job.url)} <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect
            value={job.status}
            onChange={async (status) => {
              setData({ ...job, status });
              await api.updateJob(job.id, { status });
            }}
          />
          <Button
            size="sm"
            icon={<RefreshCw className="size-3.5" />}
            loading={analyzing}
            disabled={!job.details}
            onClick={() => api.action(job.id, 'analyze')}
          >
            Re-score
          </Button>
          <div className="relative">
            <Button size="sm" variant="ai" icon={<Wand2 className="size-3.5" />} loading={tailoring} disabled={!job.details} onClick={() => setTailorOpen((o) => !o)}>
              {job.tailored ? 'Re-tailor resume' : 'Tailor resume'}
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
            {tailorOpen && (
              <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="text-sm font-medium text-slate-900">Tailor for {job.company || 'this role'}</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Creates <span className="font-mono">…_{[job.id, job.postingId, job.company.trim().replace(/\W+/g, '_')].filter(Boolean).join('_')}.md</span>. Your master stays untouched.
                </p>
                <textarea
                  value={instr}
                  onChange={(e) => setInstr(e.target.value)}
                  rows={3}
                  placeholder="Optional guidance, e.g. “lead with platform leadership, keep to one page”"
                  className={inputCls + ' mt-2 text-[13px]'}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setTailorOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="ai" onClick={tailor} icon={<Sparkles className="size-3.5" />}>
                    Run agent
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!!job.duplicates?.length && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <span className="font-semibold">Possible duplicate:</span>
          {job.duplicates.map((d) => (
            <Link key={d.id} to={`/jobs/${d.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-0.5 ring-1 ring-amber-200 hover:ring-amber-400">
              <span className="font-mono text-[11px] font-semibold">{d.id}</span>
              <span className="max-w-[320px] truncate text-slate-700">{d.title}</span>
              <span className="text-xs text-amber-700">· {d.reason}</span>
            </Link>
          ))}
          <button
            onClick={async () => {
              if (!confirm(`Delete ${job.id} (and its tailored resume)? ${job.duplicates![0].id} stays.`)) return;
              await api.deleteJob(job.id);
              window.location.href = `/jobs/${job.duplicates![0].id}`;
            }}
            className="ml-auto shrink-0 text-xs font-medium text-amber-800 underline hover:text-amber-950"
          >
            Delete this copy
          </button>
        </div>
      )}

      {/* ---------- score strip ---------- */}
      <ScoreStrip job={job} />

      {running.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {running.map((t) => (
            <TaskLog key={t.id} task={t} compact />
          ))}
        </div>
      )}
      {job.scan.state === 'error' && <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Scan failed: {job.scan.error}</div>}

      {/* ---------- tabs ---------- */}
      <div className="mt-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'match', label: <><ScanSearch className="size-4" /> Match view</> },
            { id: 'resume', label: <><FileText className="size-4" /> Tailored resume {job.tailored && <span className="size-1.5 rounded-full bg-emerald-500" />}</> },
            { id: 'cover', label: <><Mail className="size-4" /> Cover letter</> },
            { id: 'prep', label: <><GraduationCap className="size-4" /> Interview prep</> },
            { id: 'notes', label: <><MessageSquare className="size-4" /> Notes & activity</> },
          ]}
        />
      </div>

      <div className="mt-5">
        {!job.details ? (
          scanning || job.scan.state === 'pending' ? (
            <ScanningState />
          ) : (
            <PasteJd job={job} />
          )
        ) : tab === 'match' ? (
          <MatchView job={job} />
        ) : tab === 'resume' ? (
          <TailoredTab job={job} onTailor={() => setTailorOpen(true)} busy={tailoring} />
        ) : tab === 'cover' ? (
          <DocTab job={job} kind="cover-letter" />
        ) : tab === 'prep' ? (
          <DocTab job={job} kind="interview-prep" />
        ) : (
          <NotesTab job={job} />
        )}
      </div>
    </div>
  );
}

// ======================================================================== score strip

function ScoreStrip({ job }: { job: Job }) {
  const a = job.analysis;
  const t = job.tailored?.analysis;
  const best = t ?? a;
  const delta = a && t ? t.score - a.score : undefined;
  const [more, setMore] = useState(false);
  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <ScoreRing score={a?.score} size={68} label="Master resume" />
        <div className="flex items-center gap-4">
          <ArrowRight className="size-4 text-slate-300" />
          <div className="relative">
            <ScoreRing score={t?.score} size={68} label="Tailored copy" sub={t ? undefined : job.tailored ? 'Scoring…' : 'Not created'} />
            {delta != null && delta !== 0 && (
              <span className={cx('absolute -top-1 left-11 rounded-full px-1.5 py-px text-[10.5px] font-semibold ring-2 ring-white', delta > 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')}>
                {delta > 0 ? '+' : ''}
                {delta}
              </span>
            )}
          </div>
        </div>
        <div className="grid min-w-[240px] max-w-[380px] flex-1 gap-y-1.5 border-slate-100 @3xl:border-l @3xl:pl-8">
          <MeterRow label="Required" value={best?.breakdown.required} />
          <MeterRow label="Preferred" value={best?.breakdown.preferred} />
          <MeterRow label="Experience" value={best?.breakdown.experience} />
          <MeterRow label="ATS keywords" value={best?.keywordCoverage} />
        </div>
      </div>
      <div className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-3 text-[13px]">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-slate-500">Verdict{t ? ' (tailored)' : ''}: </span>
          <span className={cx('text-slate-900', !more && 'line-clamp-1')}>{best?.verdict ?? (job.details ? 'Waiting for analysis…' : 'Scanning posting…')}</span>
          {best && (
            <span className="mt-0.5 block text-xs text-slate-500">
              {best.requirements.filter((r) => r.type === 'must' && r.status === 'met').length}/{best.requirements.filter((r) => r.type === 'must').length} must-haves met ·{' '}
              {best.missingKeywords.length} keywords missing · scored {timeAgo(best.at)}
              {(best.verdict?.length ?? 0) > 90 && (
                <button onClick={() => setMore((m) => !m)} className="ml-2 font-medium text-brand-600 hover:underline">
                  {more ? 'less' : 'full verdict'}
                </button>
              )}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ======================================================================== match view (side by side)

const REQ_ICON = {
  met: <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-label="Met" />,
  partial: <CircleDashed className="size-4 shrink-0 text-amber-600" aria-label="Partial" />,
  missing: <XCircle className="size-4 shrink-0 text-rose-600" aria-label="Missing" />,
};

function MatchView({ job }: { job: Job }) {
  const { data: prof } = useProfile();
  const [version, setVersion] = useState<'master' | 'tailored'>(job.tailored?.analysis ? 'tailored' : 'master');
  const [hl, setHl] = useState(true);
  const [showJd, setShowJd] = useState(false);
  const analysis: Analysis | undefined = version === 'tailored' ? job.tailored?.analysis : job.analysis;
  const file = version === 'tailored' ? job.tailored?.file : prof?.profile.masterFile;
  const { data: resume } = useResume(file);

  useEffect(() => {
    if (!job.tailored && version === 'tailored') setVersion('master');
  }, [job.tailored, version]);

  const kw = job.details?.keywords ?? [];
  const missingSet = new Set((analysis?.missingKeywords ?? []).map((k) => k.toLowerCase()));
  const resumeTerms: Term[] = useMemo(() => (analysis?.matchedKeywords ?? []).map((term) => ({ term, cls: 'kw-hit' as const })), [analysis]);
  const jdTerms: Term[] = useMemo(
    () => kw.map((k) => ({ term: k.term, cls: missingSet.has(k.term.toLowerCase()) ? ('kw-miss' as const) : ('kw-hit' as const) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kw, analysis],
  );
  const jdMatcher = useMemo(() => (analysis ? buildMatcher(jdTerms) : null), [jdTerms, analysis]);

  const reqs =
    analysis?.requirements ??
    [...(job.details?.mustHave ?? []).map((text) => ({ text, type: 'must' as const })), ...(job.details?.niceToHave ?? []).map((text) => ({ text, type: 'nice' as const }))].map(
      (r) => ({ ...r, status: undefined as undefined | 'met' | 'partial' | 'missing', evidence: '' }),
    );

  return (
    <div className="space-y-5">
      {analysis && <Insights job={job} analysis={analysis} />}
    <div className={cx('grid items-start gap-5 @3xl:grid-cols-2', !hl && 'no-highlight')}>
      {/* ---------------- LEFT: what the role asks ---------------- */}
      <div className="min-w-0 space-y-5">
        <Card className="p-5">
          <SectionTitle>What the role asks</SectionTitle>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700">{job.details?.summary}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            {job.details?.seniority && <span className="rounded-md bg-slate-100 px-2 py-0.5">{job.details.seniority}</span>}
            {job.details?.yearsExperience && <span className="rounded-md bg-slate-100 px-2 py-0.5">{job.details.yearsExperience} experience</span>}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle right={analysis && <Legend />}>Requirements</SectionTitle>
          {(['must', 'nice'] as const).map((type) => {
            const list = reqs.filter((r) => r.type === type);
            if (!list.length) return null;
            return (
              <div key={type} className="mt-3">
                <div className="mb-1.5 text-xs font-semibold text-slate-700">{type === 'must' ? 'Must have' : 'Nice to have'}</div>
                <ul className="space-y-1">
                  {list.map((r, i) => (
                    <li key={i} className="group rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <div className="flex items-start gap-2 text-[13px] text-slate-800">
                        {r.status ? REQ_ICON[r.status] : <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300" />}
                        <span className="min-w-0 flex-1">{r.text}</span>
                      </div>
                      {r.evidence && <div className="ml-6 mt-0.5 text-xs text-slate-500">{r.evidence}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>

        <Card className="p-5">
          <SectionTitle right={analysis && <span className="text-xs text-slate-500">{analysis.keywordCoverage}% covered</span>}>ATS keywords</SectionTitle>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {kw.map((k) => {
              const miss = analysis && missingSet.has(k.term.toLowerCase());
              const hit = analysis && !miss;
              return (
                <span
                  key={k.term}
                  title={`${k.category} · ${k.importance} importance`}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                    hit ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : miss ? 'bg-rose-50 text-rose-800 ring-rose-200' : 'bg-slate-50 text-slate-700 ring-slate-200',
                    k.importance === 'high' && 'font-semibold',
                  )}
                >
                  {hit ? <Check className="size-3" /> : miss ? <XCircle className="size-3" /> : null}
                  {k.term}
                </span>
              );
            })}
          </div>
        </Card>

        {!!job.details?.redFlags?.length && (
          <Card className="p-5">
            <SectionTitle>Watch-outs in the posting</SectionTitle>
            <ul className="mt-2 space-y-1.5">
              {job.details.redFlags.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
                  <Flag className="mt-0.5 size-3.5 shrink-0 text-amber-600" /> {f}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5">
          <button onClick={() => setShowJd((s) => !s)} className="flex w-full items-center justify-between">
            <SectionTitle>Full job description</SectionTitle>
            <ChevronDown className={cx('size-4 text-slate-500 transition', showJd && 'rotate-180')} />
          </button>
          {showJd && (
            <div className="scrollbar-thin mt-3 max-h-[640px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
              {splitText(job.jdText, jdMatcher).map((p, i) => (p.cls ? <mark key={i} className={p.cls}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
            </div>
          )}
        </Card>
      </div>

      {/* ---------------- RIGHT: your resume ---------------- */}
      <div className="min-w-0 @3xl:sticky @3xl:top-4">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              {(['master', 'tailored'] as const).map((v) => (
                <button
                  key={v}
                  disabled={v === 'tailored' && !job.tailored}
                  onClick={() => setVersion(v)}
                  className={cx(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                    version === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                  )}
                >
                  {v === 'master' ? 'Master' : 'Tailored'}
                  {(v === 'master' ? job.analysis : job.tailored?.analysis) && (
                    <span className="ml-1 tabular-nums text-slate-500">{(v === 'master' ? job.analysis : job.tailored?.analysis)?.score}%</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="truncate font-mono text-[11px] text-slate-500">{file}</span>
              <button onClick={() => setHl((h) => !h)} className={cx('flex items-center gap-1 text-xs font-medium', hl ? 'text-brand-600' : 'text-slate-500')}>
                <Highlighter className="size-3.5" /> Highlights
              </button>
            </div>
          </div>
          <div className="scrollbar-thin bg-slate-100/60 p-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="mx-auto max-w-[760px] rounded-sm bg-white px-5 py-6 sm:px-9 sm:py-8 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_8px_24px_-12px_rgba(15,23,42,0.15)]">
              {resume === undefined || (file && resume.file !== file) ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-3 w-72" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : resume.content ? (
                <ResumeView markdown={resume.content} terms={resumeTerms} />
              ) : (
                <Empty icon={<FileText className="size-5" />} title="No master resume yet" body={<Link to="/profile" className="text-brand-600 underline">Import it on your profile</Link>} />
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
    </div>
  );
}

// Gap analysis row shown above the side-by-side split (compact; expands on demand).
const SEV_RANK = { critical: 0, major: 1, minor: 2 } as const;

function Insights({ job, analysis }: { job: Job; analysis: Analysis }) {
  const { askAgent } = useLive();
  const [all, setAll] = useState(false);
  const gaps = [...analysis.gaps].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const shownGaps = all ? gaps : gaps.slice(0, 4);
  const hidden = gaps.length - shownGaps.length + (all ? 0 : analysis.recommendations.length);
  return (
    <div className="grid items-start gap-5 @4xl:grid-cols-3">
      <Card className="p-5 @4xl:col-span-2">
        <SectionTitle
          right={
            hidden > 0 || all ? (
              <button onClick={() => setAll((a) => !a)} className="text-xs font-medium text-brand-600 hover:underline">
                {all ? 'Show less' : `Show all gaps & ${analysis.recommendations.length} recommended edits`}
              </button>
            ) : null
          }
        >
          Gaps to close · {gaps.filter((g) => g.severity === 'critical').length} critical
        </SectionTitle>
        {gaps.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No material gaps found.</p>
        ) : (
          <ul className="mt-3 grid gap-x-6 gap-y-3 @2xl:grid-cols-2">
            {shownGaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <AlertTriangle className={cx('mt-0.5 size-4 shrink-0', g.severity === 'critical' ? 'text-rose-600' : g.severity === 'major' ? 'text-amber-600' : 'text-slate-500')} />
                <div className="min-w-0 text-[13px]">
                  <span className="font-medium text-slate-900">{g.text}</span>
                  <span className="ml-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{g.severity}</span>
                  <div className={cx('text-xs text-slate-500', !all && 'line-clamp-2')}>{g.suggestion}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {all && analysis.recommendations.length > 0 && (
          <>
            <div className="mt-5 text-xs font-semibold text-slate-700">Recommended edits</div>
            <ul className="mt-1.5 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
              {analysis.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-brand-500" /> {r}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card className="p-5">
        {analysis.strengths.length > 0 && (
          <>
            <SectionTitle>Strengths to lead with</SectionTitle>
            <ul className="mt-2 space-y-1.5">
              {(all ? analysis.strengths : analysis.strengths.slice(0, 3)).map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> <span className={cx(!all && 'line-clamp-2')}>{s}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {analysis.questionsForCandidate.length > 0 && (
          <div className="mt-4 rounded-lg bg-brand-50/60 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
              <CircleHelp className="size-3.5" /> The agent wants to know
            </div>
            <ul className="mt-1.5 space-y-1">
              {(all ? analysis.questionsForCandidate : analysis.questionsForCandidate.slice(0, 3)).map((q, i) => (
                <li key={i}>
                  <button onClick={() => askAgent(`Re: ${job.id} — "${q}"\n\nMy answer: `)} className="text-left text-[12.5px] text-slate-700 hover:text-brand-700 hover:underline">
                    {q}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-slate-500">Click to answer in the copilot. True facts get saved to your achievements.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-[11px] text-slate-500">
      <span className="flex items-center gap-1">{REQ_ICON.met} Met</span>
      <span className="flex items-center gap-1">{REQ_ICON.partial} Partial</span>
      <span className="flex items-center gap-1">{REQ_ICON.missing} Missing</span>
    </span>
  );
}

// ======================================================================== tailored tab

function TailoredTab({ job, onTailor, busy }: { job: Job; onTailor: () => void; busy: boolean }) {
  const { data: prof } = useProfile();
  const { data: tailored, reload } = useResume(job.tailored?.file);
  const [mode, setMode] = useState<'preview' | 'diff' | 'edit'>('preview');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(tailored?.content ?? ''), [tailored?.content]);

  if (!job.tailored)
    return (
      <Card>
        <Empty
          icon={<Wand2 className="size-5" />}
          title="No tailored copy yet"
          body="The agent rewrites your summary, reorders skills and sharpens bullets for this role using only facts from your master resume and achievements."
          action={
            <Button variant="ai" loading={busy} onClick={onTailor} icon={<Sparkles className="size-4" />}>
              Tailor resume
            </Button>
          }
        />
      </Card>
    );

  const file = job.tailored.file;
  const save = async () => {
    setSaving(true);
    await api.saveResume(file, draft);
    setSaving(false);
    reload();
    setMode('preview');
    api.action(job.id, 'analyze', { target: 'tailored' });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {(['preview', 'diff', 'edit'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cx('rounded-md px-2.5 py-1 text-xs font-medium capitalize', mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
              >
                {m === 'diff' ? 'Changes vs master' : m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="mr-2 font-mono text-[11px] text-slate-500">{file}</span>
            <a href={`/api/resumes/${file}/download`}>
              <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />}>
                .md
              </Button>
            </a>
            <a href={`/print/${file}`} target="_blank" rel="noreferrer">
              <Button size="sm" icon={<Printer className="size-3.5" />}>PDF</Button>
            </a>
          </div>
        </div>
        <div className="bg-slate-100/60 p-4">
          {mode === 'edit' ? (
            <div>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className={inputCls + ' scrollbar-thin min-h-[640px] font-mono text-[12.5px] leading-relaxed'} />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setMode('preview')}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" loading={saving} onClick={save}>
                  Save & re-score
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[760px] rounded-sm bg-white px-5 py-6 sm:px-9 sm:py-8 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_8px_24px_-12px_rgba(15,23,42,0.15)]">
              {mode === 'preview' ? <ResumeView markdown={tailored?.content ?? ''} /> : <DiffView before={prof?.master ?? ''} after={tailored?.content ?? ''} />}
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="p-5">
          <SectionTitle>What the agent changed</SectionTitle>
          <ul className="mt-3 space-y-2">
            {job.tailored.changes.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
                <Pencil className="mt-0.5 size-3.5 shrink-0 text-brand-500" /> {c}
              </li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-slate-500">Created {timeAgo(job.tailored.createdAt)}</div>
        </Card>
        <Card className="space-y-2 p-5">
          <SectionTitle>Next</SectionTitle>
          <Button className="w-full" icon={<RefreshCw className="size-3.5" />} onClick={() => api.action(job.id, 'analyze', { target: 'tailored' })}>
            Re-score tailored copy
          </Button>
          <Button className="w-full" variant="ai" loading={busy} icon={<Wand2 className="size-3.5" />} onClick={onTailor}>
            Regenerate with guidance
          </Button>
        </Card>
      </div>
    </div>
  );
}

function DiffView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <div className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-slate-700">
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className="rounded-sm bg-emerald-100 text-emerald-900 no-underline">
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="rounded-sm bg-rose-50 text-rose-700/80">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </div>
  );
}

// ======================================================================== cover letter / prep

function DocTab({ job, kind }: { job: Job; kind: 'cover-letter' | 'interview-prep' }) {
  const { running } = useJobTasks(job.id);
  const busy = running.some((t) => t.kind === kind);
  const content = kind === 'cover-letter' ? job.coverLetter : job.interviewPrep;
  const [instr, setInstr] = useState('');
  const [copied, setCopied] = useState(false);
  const label = kind === 'cover-letter' ? 'cover letter' : 'interview prep pack';
  const run = () => api.action(job.id, kind, { instructions: instr || undefined });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="p-6">
        {content ? (
          <>
            <div className="mb-3 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                onClick={() => {
                  navigator.clipboard.writeText(content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <Md className="mx-auto max-w-[720px]">{content}</Md>
          </>
        ) : (
          <Empty
            icon={kind === 'cover-letter' ? <Mail className="size-5" /> : <GraduationCap className="size-5" />}
            title={`No ${label} yet`}
            body={kind === 'cover-letter' ? 'Written from your tailored resume (if any) plus a quick look at the company.' : 'Likely questions, STAR stories from your real experience, how to handle gaps, and questions to ask.'}
          />
        )}
      </Card>
      <Card className="h-fit space-y-3 p-5">
        <SectionTitle>{content ? 'Regenerate' : 'Generate'}</SectionTitle>
        <textarea value={instr} onChange={(e) => setInstr(e.target.value)} rows={3} placeholder="Optional guidance for the agent…" className={inputCls + ' text-[13px]'} />
        <Button className="w-full" variant="ai" loading={busy} onClick={run} icon={<Sparkles className="size-3.5" />}>
          {content ? `Rewrite ${label}` : `Create ${label}`}
        </Button>
      </Card>
    </div>
  );
}

// ======================================================================== notes

function NotesTab({ job }: { job: Job }) {
  const [notes, setNotes] = useState(job.notes);
  const [saved, setSaved] = useState(true);
  useEffect(() => setNotes(job.notes), [job.notes]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle right={<span className="text-xs text-slate-500">{saved ? 'Saved' : 'Unsaved'}</span>}>Notes</SectionTitle>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          onBlur={async () => {
            await api.updateJob(job.id, { notes });
            setSaved(true);
          }}
          rows={14}
          placeholder="Recruiter name, referral, salary discussion, interview dates…"
          className={inputCls + ' mt-3 text-[13px]'}
        />
      </Card>
      <Card className="p-5">
        <SectionTitle>Activity</SectionTitle>
        <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
          {job.activity.map((a, i) => (
            <li key={i} className="relative">
              <span
                className={cx(
                  'absolute -left-[21px] top-1.5 size-2 rounded-full ring-2 ring-white',
                  a.kind === 'agent' ? 'bg-brand-500' : a.kind === 'status' ? 'bg-sky-500' : a.kind === 'error' ? 'bg-rose-500' : 'bg-slate-300',
                )}
              />
              <div className="text-[13px] text-slate-700">{a.text}</div>
              <div className="text-[11px] text-slate-500">{new Date(a.at).toLocaleString()}</div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

// ======================================================================== states

function ScanningState() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <Card key={i} className="space-y-3 p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ))}
    </div>
  );
}

function PasteJd({ job }: { job: Job }) {
  const [text, setText] = useState('');
  return (
    <Card className="p-6">
      <div className="text-sm font-semibold text-slate-900">Couldn't read this posting</div>
      <p className="mt-1 text-sm text-slate-500">Some sites (LinkedIn, Workday) block automated reads. Paste the description and the agent will take it from there.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className={inputCls + ' mt-3'} placeholder="Paste the job description…" />
      <div className="mt-3 flex justify-end">
        <Button variant="ai" disabled={text.length < 200} onClick={() => api.action(job.id, 'rescan', { jdText: text })} icon={<ScanSearch className="size-4" />}>
          Analyze description
        </Button>
      </div>
    </Card>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-8 py-8">
      <Skeleton className="h-6 w-80" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
