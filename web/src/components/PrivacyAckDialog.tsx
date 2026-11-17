import { useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { cx } from '../lib/format';
import { usePolicy, PolicyModal } from '../pages/PrivacyPolicy';
import { Modal } from './Modal';
import { Button } from './ui';

/**
 * For accounts that haven't acknowledged the current Privacy Policy: everyone who signed up before it existed, and
 * everyone after it changes (issue #25). It can't be dismissed; the only other way out is signing out.
 */
export function PrivacyAckDialog({ onDone }: { onDone: () => void }) {
  const id = useId();
  const { doc } = usePolicy();
  const [view, setView] = useState(false);
  const [ack, setAck] = useState(false);
  const [adult, setAdult] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ackRef = useRef<HTMLInputElement>(null);
  const adultRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ack) {
      setErr('Please accept the Privacy Policy to continue.');
      return ackRef.current?.focus();
    }
    if (!adult) {
      setErr('Please confirm that you are 18 or older.');
      return adultRef.current?.focus();
    }
    if (!doc) return;
    setBusy(true);
    try {
      await api.acknowledgePrivacy({ version: doc.version, acknowledged: true, ageConfirmed: true, language: navigator.language || 'en' });
      onDone();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const ready = ack && adult && !!doc;
  return (
    <>
      <Modal open onClose={() => {}} dismissable={false} labelledBy={`${id}-t`} describedBy={`${id}-d`}>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <h2 id={`${id}-t`} className="text-lg font-semibold text-slate-900">
              Please review our Privacy Policy
            </h2>
            <p id={`${id}-d`} className="mt-2 text-[15px] leading-relaxed text-slate-700">
              We’ve published a Privacy Policy that explains what we collect, how AI services are used, how long we keep things and what you can delete. Please review it to keep using Job Hunt Alpha.
            </p>
            {doc && (
              <p className="mt-2 text-sm text-slate-600">
                Version {doc.version} · effective {doc.effectiveDate}
              </p>
            )}
            <Button type="button" className="mt-4" data-autofocus onClick={() => setView(true)}>
              View Privacy Policy
            </Button>

            <div className="mt-6 space-y-3">
              <label className="flex items-start gap-3 text-[14px] leading-snug text-slate-800">
                <input ref={ackRef} type="checkbox" checked={ack} onChange={(e) => (setAck(e.target.checked), setErr(''))} className="mt-0.5 size-[18px] shrink-0 accent-brand-700" />
                I have reviewed the Privacy Policy and understand how my personal information may be collected, used, and shared.
              </label>
              <label className="flex items-start gap-3 text-[14px] leading-snug text-slate-800">
                <input ref={adultRef} type="checkbox" checked={adult} onChange={(e) => (setAdult(e.target.checked), setErr(''))} className="mt-0.5 size-[18px] shrink-0 accent-brand-700" />
                I’m 18 or older.
              </label>
            </div>
            <p role="alert" aria-live="assertive" className={cx('text-sm font-medium text-rose-700', err ? 'mt-3' : 'sr-only')}>
              {err && (
                <>
                  <AlertTriangle className="mr-1 inline size-4 align-[-3px]" aria-hidden />
                  {err}
                </>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
            <Button
              type="button"
              className="h-10 w-full"
              onClick={async () => {
                await auth.logout().catch(() => {});
                location.assign('/');
              }}
            >
              Sign out
            </Button>
            <Button type="submit" variant="primary" loading={busy} aria-disabled={!ready} className={cx('h-10 w-full', !ready && 'opacity-60')}>
              Continue
            </Button>
          </div>
        </form>
      </Modal>
      <PolicyModal open={view} onClose={() => setView(false)} />
    </>
  );
}
