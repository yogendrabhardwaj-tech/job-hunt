import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Download, FileText, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { useJobs, useLive, useResume } from '../lib/live';
import { PageHeader } from '../components/Layout';
import { ResumeView } from '../components/Markdown';
import { Button, Card, Empty, MiniBar } from '../components/ui';
import { cx, timeAgo } from '../lib/format';
import type { ResumeFile } from '../lib/types';

export function Resumes() {
  const [files, setFiles] = useState<ResumeFile[]>([]);
  const [sel, setSel] = useState<string>();
  const { data: jobs = [] } = useJobs();
  const { subscribe } = useLive();
  const { data: resume } = useResume(sel);

  useEffect(() => {
    const load = () =>
      api.resumes().then((f) => {
        setFiles(f);
        setSel((s) => s ?? f[0]?.file);
      });
    load();
    return subscribe((m) => (m.type === 'job' || m.type === 'profile') && load());
  }, [subscribe]);

  const jobFor = (file: string) => jobs.find((j) => j.tailored?.file === file);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
      <PageHeader title="Resume library" sub="Your master plus every tailored copy (suffixed with the job ID), stored as Markdown in data/resumes/." />
      {files.length === 0 ? (
        <Card>
          <Empty icon={<FileText className="size-5" />} title="No resumes yet" body={<Link to="/profile" className="text-brand-600 underline">Import your master resume</Link>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[320px_1fr] @5xl:grid-cols-[360px_1fr]">
          <Card className="h-fit overflow-hidden">
            {files.map((f) => {
              const job = jobFor(f.file);
              return (
                <button
                  key={f.file}
                  onClick={() => setSel(f.file)}
                  className={cx('flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0', sel === f.file ? 'bg-brand-50/60' : 'hover:bg-slate-50')}
                >
                  <div className={cx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', f.master ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500')}>
                    {f.master ? <Crown className="size-4" /> : <FileText className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12px] font-medium text-slate-900">{f.file}</div>
                    <div className="truncate text-xs text-slate-500">{f.master ? 'Master resume' : job ? `${job.title} · ${job.company}` : 'Tailored copy'}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      {timeAgo(f.updatedAt)}
                      {job?.tailored?.analysis && <MiniBar score={job.tailored.analysis.score} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </Card>
          <div className="min-w-0">
            {sel && (
              <div className="mb-3 flex items-center justify-end gap-2">
                {jobFor(sel) && (
                  <Link to={`/jobs/${jobFor(sel)!.id}`}>
                    <Button size="sm" variant="ghost">
                      Open job {jobFor(sel)!.id}
                    </Button>
                  </Link>
                )}
                <a href={`/api/resumes/${sel}/download`}>
                  <Button size="sm" icon={<Download className="size-3.5" />}>Markdown</Button>
                </a>
                <a href={`/print/${sel}`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="primary" icon={<Printer className="size-3.5" />}>Print / PDF</Button>
                </a>
              </div>
            )}
            <div className="rounded-xl bg-slate-100/70 p-2 sm:p-5">
              <div className="mx-auto max-w-[760px] rounded-sm bg-white px-5 py-6 sm:px-10 sm:py-9 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_8px_24px_-12px_rgba(15,23,42,0.15)]">
                <ResumeView markdown={resume?.content ?? ''} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
