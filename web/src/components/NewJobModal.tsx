import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ClipboardPaste, Link2, ScanSearch, X } from 'lucide-react';
import { api } from '../lib/api';
import type { DuplicateMatch } from '../lib/types';
import { STATUS_META } from '../lib/format';
import { Button, inputCls } from './ui';

export function NewJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [jd, setJd] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [postingId, setPostingId] = useState('');
  const [dups, setDups] = useState<DuplicateMatch[]>([]);
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl('');
      setJd('');
      setErr('');
      setDups([]);
      setPostingId('');
      setShowPaste(false);
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [open]);

  // live duplicate check as the link is pasted/typed
  useEffect(() => {
    const u = url.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(u)) {
      setDups([]);
      setPostingId('');
      return;
    }
    const t = setTimeout(() => {
      api
        .checkJob(u)
        .then((r) => {
          setDups(r.duplicates);
          setPostingId(r.postingId);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [url]);

  if (!open) return null;

  const go = (id: string) => {
    onClose();
    nav(`/jobs/${id}`);
  };

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const job = await api.createJob(url.trim(), jd.trim() || undefined);
      go(job.id);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Track a new role</h2>
            <p className="mt-0.5 text-sm text-slate-500">Paste the job link. The agent scans it, pulls out the requirements and scores your resume.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="relative">
            <Link2 className="absolute left-3 top-2.5 size-4 text-slate-500" />
            <input
              ref={ref}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !showPaste && !dups.length && submit()}
              placeholder="https://boards.greenhouse.io/company/jobs/123456"
              className={inputCls + ' pl-9'}
            />
          </div>
          {postingId && !dups.length && <p className="text-xs text-slate-500">Employer job ID detected: <span className="font-mono">{postingId}</span></p>}

          {dups.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                <AlertTriangle className="size-4" /> Already in your tracker
              </div>
              <ul className="mt-2 space-y-1.5">
                {dups.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-[13px]">
                    <span className="rounded bg-slate-900 px-1.5 py-px font-mono text-[11px] text-white">{d.id}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-slate-900">{d.title}</span>
                      {d.company && <span className="text-slate-500"> · {d.company}</span>}
                      <span className="block text-xs text-amber-800">
                        {d.reason} · {STATUS_META[d.status].label}
                      </span>
                    </span>
                    <button onClick={() => go(d.id)} className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
                      Open <ArrowRight className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showPaste ? (
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={8}
              placeholder="Paste the full job description (use this for LinkedIn / Workday pages that block scraping)"
              className={inputCls + ' scrollbar-thin resize-y'}
            />
          ) : (
            <button onClick={() => setShowPaste(true)} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">
              <ClipboardPaste className="size-3.5" /> Site blocks scraping? Paste the description instead
            </button>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
        <div className="flex items-center justify-between rounded-b-2xl bg-slate-50 px-5 py-3">
          <span className="text-xs text-slate-500">Greenhouse, Lever, Ashby & most career sites work directly</span>
          <div className="flex gap-2">
            {dups.length > 0 && (
              <Button variant="secondary" onClick={() => go(dups[0].id)}>
                Open {dups[0].id}
              </Button>
            )}
            <Button
              variant={dups.length ? 'secondary' : 'ai'}
              onClick={submit}
              loading={busy}
              disabled={!url.trim() && !jd.trim()}
              icon={<ScanSearch className="size-4" />}
            >
              {dups.length ? 'Add anyway' : 'Scan role'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
