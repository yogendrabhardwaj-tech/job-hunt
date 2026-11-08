import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, FileUp, Plus, Sparkles, Target, Wand2 } from 'lucide-react';
import { useJobs, useLive, useProfile } from '../lib/live';
import { PageHeader } from '../components/Layout';
import { PipelineBoard } from '../components/PipelineBoard';
import { Button, Card, SectionTitle } from '../components/ui';
import { timeAgo, cx } from '../lib/format';
import type { Job } from '../lib/types';

function nextActions(jobs: Job[]) {
  const out: { job: Job; text: string; icon: React.ReactNode }[] = [];
  for (const j of jobs) {
    if (['rejected', 'withdrawn'].includes(j.status)) continue;
    const s = j.analysis?.score;
    if (j.status === 'saved' && s != null && s >= 60 && !j.tailored) out.push({ job: j, text: `Strong match (${s}%). Tailor your resume and apply`, icon: <Wand2 className="size-4" /> });
    else if (j.status === 'saved' && j.tailored) out.push({ job: j, text: 'Tailored resume ready. Submit the application', icon: <ArrowRight className="size-4" /> });
    else if (['screening', 'interviewing'].includes(j.status) && !j.interviewPrep) out.push({ job: j, text: 'Generate an interview prep pack', icon: <Target className="size-4" /> });
  }
  return out.slice(0, 5);
}

export function Dashboard() {
  const { data: jobs = [], setData } = useJobs();
  const { data: prof } = useProfile();
  const { tasks } = useLive();
  const { openNew } = useOutletContext<{ openNew: () => void }>();
  const first = prof?.profile.name?.split(' ')[0];
  const actions = nextActions(jobs);
  const runs = tasks.filter((t) => t.kind !== 'chat').slice(0, 6);

  return (
    <div className="mx-auto max-w-[1180px] px-4 sm:px-6 py-8">
      <PageHeader
        title={first ? `Good to see you, ${first}` : 'Welcome to your agency'}
        sub="Your job search at a glance. The agent keeps it up to date as you work."
        right={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
            New role
          </Button>
        }
      />

      {prof && !prof.master && (
        <Card className="mb-6 flex items-center justify-between gap-4 border-brand-200 bg-gradient-to-r from-brand-50 to-white p-5">
          <div className="flex items-center gap-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <FileUp className="size-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Start by importing your master resume</div>
              <div className="text-sm text-slate-500">Upload a PDF or DOCX, then add achievements and your LinkedIn. Every match score and tailored copy builds on it.</div>
            </div>
          </div>
          <Link to="/profile">
            <Button variant="ai">Set up profile</Button>
          </Link>
        </Card>
      )}

      <PipelineBoard jobs={jobs} onNew={openNew} onChanged={(next) => setData(next)} />

      <div className="mt-6 grid gap-6 @3xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Suggested next steps</SectionTitle>
          {actions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing pressing right now.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {actions.map((a) => (
                <li key={a.job.id}>
                  <Link to={`/jobs/${a.job.id}`} className="flex items-start gap-3 rounded-lg p-2 transition hover:bg-slate-50">
                    <span className="mt-0.5 text-brand-600">{a.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-slate-900">
                        {a.job.title} · {a.job.company}
                      </span>
                      <span className="block text-xs text-slate-500">{a.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Recent agent runs</SectionTitle>
          <ul className="mt-3 space-y-2.5">
            {runs.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 text-[13px]">
                <Sparkles className={cx('size-3.5', t.state === 'running' ? 'animate-pulse text-brand-500' : t.state === 'error' ? 'text-rose-500' : 'text-slate-500')} />
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {t.title}
                  {t.jobId && <span className="text-slate-500"> · {t.jobId}</span>}
                </span>
                <span className="whitespace-nowrap text-xs text-slate-500">{t.state === 'running' ? 'running' : t.state === 'error' ? 'failed' : timeAgo(t.endedAt)}</span>
              </li>
            ))}
            {runs.length === 0 && <li className="text-sm text-slate-500">No runs yet this session.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
