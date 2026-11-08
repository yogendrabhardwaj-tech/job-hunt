import { useEffect, useRef, useState } from 'react';
import { Check, FileUp, Link2 as Linkedin, Pencil, Printer, Sparkles, Trophy, Upload } from 'lucide-react';
import { useLive, useProfile } from '../lib/live';
import { api } from '../lib/api';
import { PageHeader } from '../components/Layout';
import { ResumeView } from '../components/Markdown';
import { TaskLog } from '../components/TaskLog';
import { Button, Card, Empty, SectionTitle, Skeleton, inputCls } from '../components/ui';
import { cx, timeAgo } from '../lib/format';
import type { Profile } from '../lib/types';

export function ProfilePage() {
  const { data, reload } = useProfile();
  const { tasks, askAgent } = useLive();
  const importTask = tasks.find((t) => t.kind === 'import-resume');
  const importing = importTask?.state === 'running';
  const [form, setForm] = useState<Partial<Profile>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMaster, setEditMaster] = useState(false);
  const [masterDraft, setMasterDraft] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const liRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data && !dirty) setForm(data.profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    await api.saveProfile(form);
    setSaving(false);
    setDirty(false);
    reload();
  };

  const importFile = async (file?: File, text?: string) => {
    setErr('');
    const fd = new FormData();
    if (file) fd.append('file', file);
    if (text) fd.append('text', text);
    try {
      await api.importResume(fd);
      setPasteOpen(false);
      setPaste('');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const uploadLinkedin = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const p = await api.uploadLinkedin(fd);
    setForm((f) => ({ ...f, linkedinText: p.linkedinText }));
  };

  const master = data?.master ?? '';

  // Don't render editable fields or the "no resume" empty state until the real profile has arrived.
  if (!data)
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8" aria-busy="true" aria-label="Loading profile">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="mt-8 grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(320px,400px)_1fr]">
          <div className="space-y-6">
            {[5, 3, 2].map((n, i) => (
              <Card key={i} className="space-y-3 p-5">
                <Skeleton className="h-3.5 w-28" />
                {Array.from({ length: n }, (_, k) => (
                  <Skeleton key={k} className="h-9 w-full" />
                ))}
              </Card>
            ))}
          </div>
          <div className="space-y-4">
            <Card className="p-5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="mt-2 h-3 w-64" />
            </Card>
            <div className="rounded-xl bg-slate-100/70 p-2 sm:p-5">
              <div className="mx-auto max-w-[760px] space-y-3 rounded-sm bg-white px-5 py-6 sm:px-10 sm:py-9">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-3 w-80 max-w-full" />
                {Array.from({ length: 12 }, (_, k) => (
                  <Skeleton key={k} className={k % 4 === 0 ? 'mt-5 h-3.5 w-40' : 'h-3 w-full'} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-8">
      <PageHeader
        title="Profile & master resume"
        sub="Your source of truth. Every match score and tailored copy is built only from what's here."
        right={
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={save} icon={!dirty ? <Check className="size-4" /> : undefined}>
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(320px,400px)_1fr]">
        {/* ------------ left: details ------------ */}
        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <SectionTitle>Contact</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" className="col-span-2">
                <input value={form.name ?? ''} onChange={set('name')} className={inputCls} />
              </Field>
              <Field label="Email">
                <input value={form.email ?? ''} onChange={set('email')} className={inputCls} />
              </Field>
              <Field label="Phone">
                <input value={form.phone ?? ''} onChange={set('phone')} className={inputCls} />
              </Field>
              <Field label="Location">
                <input value={form.location ?? ''} onChange={set('location')} className={inputCls} />
              </Field>
              <Field label="Headline">
                <input value={form.headline ?? ''} onChange={set('headline')} className={inputCls} />
              </Field>
              <Field label="Target roles" className="col-span-2">
                <input value={form.targetRoles ?? ''} onChange={set('targetRoles')} placeholder="e.g. Senior Data Engineer, Analytics Engineering Lead" className={inputCls} />
              </Field>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <SectionTitle
              right={
                <button onClick={() => askAgent('Interview me to uncover achievements and metrics missing from my resume. Ask one question at a time, then save them to my achievements.', { send: true })} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <Sparkles className="size-3.5" /> Let the agent interview me
                </button>
              }
            >
              <span className="flex items-center gap-1.5">
                <Trophy className="size-3.5" /> Achievements & extra facts
              </span>
            </SectionTitle>
            <p className="text-xs text-slate-500">Wins, metrics, projects, tools — anything true that isn't on the resume yet. The agent may use these when tailoring.</p>
            <textarea
              value={form.achievements ?? ''}
              onChange={set('achievements')}
              rows={10}
              placeholder={'- Cut cloud spend 32% ($410k/yr) by re-architecting the ingestion pipeline (2024)\n- Led migration of 140 services to Kubernetes with zero downtime\n- AWS Solutions Architect – Professional (2023)'}
              className={inputCls + ' scrollbar-thin font-mono text-[12.5px] leading-relaxed'}
            />
          </Card>

          <Card className="space-y-3 p-5">
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <Linkedin className="size-3.5" /> LinkedIn
              </span>
            </SectionTitle>
            <input value={form.linkedinUrl ?? ''} onChange={set('linkedinUrl')} placeholder="https://www.linkedin.com/in/your-handle" className={inputCls} />
            <p className="text-xs text-slate-500">
              LinkedIn blocks automated reading. On your profile choose <b>More → Save to PDF</b> and upload it here, or paste your About + Experience text.
            </p>
            <div className="flex gap-2">
              <input ref={liRef} type="file" accept=".pdf,.txt" hidden onChange={(e) => e.target.files?.[0] && uploadLinkedin(e.target.files[0])} />
              <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => liRef.current?.click()}>
                Upload LinkedIn PDF
              </Button>
              {form.linkedinText && <span className="self-center text-xs text-emerald-700">✓ {form.linkedinText.length.toLocaleString()} chars loaded</span>}
            </div>
            <textarea value={form.linkedinText ?? ''} onChange={set('linkedinText')} rows={4} placeholder="…or paste LinkedIn profile text" className={inputCls + ' scrollbar-thin text-[12.5px]'} />
          </Card>
        </div>

        {/* ------------ right: master resume ------------ */}
        <div className="min-w-0 space-y-4">
          {importTask && (importing || importTask.state === 'error') && <TaskLog task={importTask} />}

          <Card
            className={cx('p-5 transition', drag && 'ring-2 ring-brand-500')}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) importFile(f);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionTitle>Master resume</SectionTitle>
                <div className="mt-1 font-mono text-[11px] text-slate-500">
                  data/resumes/{data?.profile.masterFile} {master && `· updated ${timeAgo(data?.profile.updatedAt)}`}
                </div>
              </div>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
                <Button size="sm" variant="ai" loading={importing} icon={<FileUp className="size-3.5" />} onClick={() => fileRef.current?.click()}>
                  {master ? 'Re-import' : 'Upload resume'}
                </Button>
                <Button size="sm" onClick={() => setPasteOpen((o) => !o)}>
                  Paste text
                </Button>
                {master && (
                  <>
                    <Button
                      size="sm"
                      icon={<Pencil className="size-3.5" />}
                      onClick={() => {
                        setMasterDraft(master);
                        setEditMaster(true);
                      }}
                    >
                      Edit
                    </Button>
                    <a href={`/print/${data?.profile.masterFile}`} target="_blank" rel="noreferrer">
                      <Button size="sm" icon={<Printer className="size-3.5" />}>PDF</Button>
                    </a>
                  </>
                )}
              </div>
            </div>
            {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
            {pasteOpen && (
              <div className="mt-3">
                <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} placeholder="Paste your resume text…" className={inputCls} />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ai" disabled={paste.length < 100} onClick={() => importFile(undefined, paste)}>
                    Import
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {editMaster ? (
            <Card className="p-4">
              <textarea value={masterDraft} onChange={(e) => setMasterDraft(e.target.value)} className={inputCls + ' scrollbar-thin min-h-[680px] font-mono text-[12.5px] leading-relaxed'} />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditMaster(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await api.saveResume(data!.profile.masterFile, masterDraft);
                    setEditMaster(false);
                    reload();
                  }}
                >
                  Save master
                </Button>
              </div>
            </Card>
          ) : master ? (
            <div className="rounded-xl bg-slate-100/70 p-2 sm:p-5">
              <div className="mx-auto max-w-[760px] rounded-sm bg-white px-5 py-6 sm:px-10 sm:py-9 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_8px_24px_-12px_rgba(15,23,42,0.15)]">
                <ResumeView markdown={master} />
              </div>
            </div>
          ) : (
            <Card>
              <Empty
                icon={<FileUp className="size-5" />}
                title="Drop your resume here"
                body="PDF, DOCX or text. The agent converts it to clean, ATS-safe Markdown, keeping every fact exactly as written."
                action={
                  <Button variant="ai" loading={importing} onClick={() => fileRef.current?.click()} icon={<Upload className="size-4" />}>
                    Choose file
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
