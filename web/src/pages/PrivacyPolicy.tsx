import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { api, type PolicyDoc } from '../lib/api';
import { Md } from '../components/Markdown';
import { Modal } from '../components/Modal';
import { Button, Skeleton } from '../components/ui';
import { BrandMark } from '../components/ThemeSwitcher';

/** The current Privacy Policy, fetched from the server so it always matches the registry and versions. */
export function usePolicy() {
  const [doc, setDoc] = useState<PolicyDoc | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api
      .privacyPolicy()
      .then(setDoc)
      .catch(() => setErr('Privacy Policy is temporarily unavailable. Please try again later.'));
  }, []);
  return { doc, err };
}

function PolicyBody({ doc, err }: { doc: PolicyDoc | null; err: string }) {
  if (err) return <p className="text-sm text-rose-700">{err}</p>;
  if (!doc)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading the Privacy Policy">
        <Skeleton className="h-7 w-56" />
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  return <Md className="policy-md">{doc.markdown}</Md>;
}

/** Public page at /privacy: works signed out, linked from sign-up, the app sidebar and the home page. */
export function PrivacyPolicyPage() {
  const { doc, err } = usePolicy();
  useEffect(() => {
    document.title = 'Privacy Policy · Job Hunt Alpha';
  }, []);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-semibold text-slate-900">
            <BrandMark className="size-8 rounded-[9px]" />
            Job Hunt Alpha
          </Link>
          <Link to="/signup" className="text-sm font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <article className="rounded-2xl bg-white px-5 py-8 ring-1 ring-slate-200 sm:px-10">
          <PolicyBody doc={doc} err={err} />
        </article>
      </main>
    </div>
  );
}

/** The policy in a dialog, so reading it never loses what's been typed on the page underneath. */
export function PolicyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const id = useId();
  const { doc, err } = usePolicy();
  return (
    <Modal open={open} onClose={onClose} labelledBy={`${id}-t`} size="lg">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 id={`${id}-t`} className="text-base font-semibold text-slate-900">
            Privacy Policy
          </h2>
          {doc && (
            <p className="text-xs text-slate-600">
              Version {doc.version} · effective {doc.effectiveDate}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close the Privacy Policy" className="-mr-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
          <X className="size-5" />
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6" tabIndex={0} aria-label="Privacy Policy text">
        <PolicyBody doc={doc} err={err} />
      </div>
      <div className="border-t border-slate-100 px-5 py-3 text-right sm:px-6">
        <Button data-autofocus onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
