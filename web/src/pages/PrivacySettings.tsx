import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { requestConsent } from '../lib/consent';
import { cx } from '../lib/format';
import type { ConsentHistory, ConsentStatus, Disclosure, Feature, Preferences } from '../lib/types';
import { PageHeader } from '../components/Layout';
import { Modal } from '../components/Modal';
import { Button, Card, SectionTitle, Skeleton, inputCls } from '../components/ui';

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

const ACTIONS: Record<ConsentHistory['action'], string> = {
  granted: 'Agreed to AI Resume Processing',
  preferences_updated: 'Changed AI preferences',
  withdrawn: 'Withdrew AI consent',
  acknowledged: 'Acknowledged the Privacy Policy',
};

/** Settings → Privacy (issues #23, #24): consent status, preferences, withdrawal and deleting resume data. */
export function PrivacySettingsPage() {
  const [s, setS] = useState<(ConsentStatus & { history: ConsentHistory[] }) | null>(null);
  const [d, setD] = useState<Disclosure | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);

  const load = async () => {
    const [status, disc] = await Promise.all([api.consent(), api.disclosure()]);
    setS(status);
    setD(disc);
  };
  useEffect(() => {
    load().catch((e) => setNote(e.message));
  }, []);

  const turnOn = async () => {
    setNote('');
    if (await requestConsent({ reason: s?.state === 'expired' ? 'expired' : 'missing', message: '' })) {
      await load();
      setNote('AI Resume Processing is on.');
    }
  };

  const savePrefs = async (p: Preferences) => {
    setSaving(true);
    setNote('');
    try {
      const next = await api.updatePreferences(p);
      setS((x) => x && { ...x, ...next });
      setNote('Preferences saved.');
    } catch (e: any) {
      setNote(e.message);
    }
    setSaving(false);
  };

  if (!s || !d)
    return (
      <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-8" aria-busy="true">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-6 h-40 w-full" />
        <Skeleton className="mt-4 h-56 w-full" />
      </div>
    );

  const active = s.state === 'active';
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-8">
      <PageHeader title="Privacy" sub="What goes to AI services, the choices you’ve made, and your data." />

      <p role="status" aria-live="polite" className={cx('text-sm', note ? 'mb-4 rounded-lg bg-slate-100 px-3 py-2 text-slate-800' : 'sr-only')}>
        {note}
      </p>

      <div className="space-y-5">
        <Card className="p-5">
          <SectionTitle>AI Resume Processing</SectionTitle>
          <div className="mt-3 flex items-start gap-3">
            {active ? <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden /> : <ShieldOff className="mt-0.5 size-5 shrink-0 text-slate-500" aria-hidden />}
            <div className="min-w-0 flex-1 text-sm text-slate-700">
              {active && (
                <>
                  <p className="font-medium text-slate-900">AI Resume Processing is enabled.</p>
                  <p className="mt-1">
                    Agreed {when(s.current?.at)} · consent version {s.current?.consentVersion}. Covers{' '}
                    {s.sources.length
                      ? s.sources.map((x) => `${d.sources.find((y) => y.id === x.id)?.name ?? x.kind} (${x.model || 'default model'})`).join(', ')
                      : 'no AI sources yet'}
                    .
                  </p>
                  <p className="mt-2">You may withdraw consent at any time. After withdrawal, we will stop sending new resume or job information to the AI service.</p>
                </>
              )}
              {s.state === 'none' && <p>AI Resume Processing is off. AI features stay off until you review what’s sent and agree.</p>}
              {s.state === 'withdrawn' && <p>AI Resume Processing has been turned off. New resume information will not be sent to the AI service.</p>}
              {s.state === 'expired' && <p>What we send, or who we send it to, has changed since you agreed. AI features are paused until you review it again.</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {active ? (
              <Button key="withdraw" variant="danger" onClick={() => setWithdrawOpen(true)}>
                Withdraw Consent
              </Button>
            ) : (
              <Button key="turn-on" variant="primary" onClick={turnOn}>
                {s.state === 'none' ? 'Review and turn on' : s.state === 'expired' ? 'Review the changes' : 'Turn back on'}
              </Button>
            )}
            <Link to="/settings" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Manage AI sources
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <fieldset disabled={!active || saving}>
            <legend className="text-[13px] font-semibold text-slate-900">AI preferences</legend>
            <p className="mt-1 text-[13px] text-slate-600">{active ? 'Changes apply to the next AI run.' : 'Turn on AI Resume Processing to change these.'}</p>
            <div className="mt-3 space-y-2">
              <Pref id="pref-name" label="Include my name in AI processing" hint="Off: the AI sees a placeholder, and your name is put back on our server." checked={s.preferences.includeName} onChange={(on) => savePrefs({ ...s.preferences, includeName: on })} />
              <Pref id="pref-contact" label="Include contact details in AI processing" hint="Always off. Tailoring doesn’t need your email, phone or address." checked={false} disabled onChange={() => {}} />
              {(Object.keys(d.features) as Feature[]).map((f) => (
                <Pref
                  key={f}
                  id={`pref-${f}`}
                  label={`Use AI for: ${d.features[f].label}`}
                  hint={d.features[f].description}
                  checked={s.preferences.features[f]}
                  onChange={(on) => savePrefs({ ...s.preferences, features: { ...s.preferences.features, [f]: on } })}
                />
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="p-5">
          <SectionTitle>Privacy Policy</SectionTitle>
          <p className="mt-2 text-sm text-slate-700">
            {s.privacyAck.version ? `You acknowledged version ${s.privacyAck.version} on ${when(s.privacyAck.at)}.` : 'You haven’t acknowledged the Privacy Policy yet.'} The current version is{' '}
            {s.versions.privacy}, effective {s.versions.privacyEffectiveDate}.
          </p>
          <a href="/privacy" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-brand-700 underline">
            Read the Privacy Policy
          </a>
        </Card>

        <Card className="p-5">
          <SectionTitle>Delete my resume and AI-generated content</SectionTitle>
          <p className="mt-2 text-sm text-slate-700">
            This will permanently delete your uploaded resume, extracted resume profile, job descriptions, AI prompts, and generated resume content associated with your account. This action cannot be undone.
          </p>
          <p className="mt-2 text-[13px] text-slate-600">
            Your account, AI-source settings and consent records stay. Requests already sent to an AI service are covered by that service’s terms; none of the services we use let us delete them for you.
          </p>
          <Button variant="danger" className="mt-4" icon={<Trash2 className="size-4" />} onClick={() => setDeleteStep(1)}>
            Delete My Data
          </Button>
        </Card>

        {s.history.length > 0 && (
          <Card className="p-5">
            <SectionTitle>Your consent history</SectionTitle>
            <ol className="mt-3 space-y-1.5 text-sm text-slate-700">
              {[...s.history].reverse().map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3">
                  <span className="tabular-nums text-slate-600">{when(h.at)}</span>
                  <span>{ACTIONS[h.action]}</span>
                  <span className="text-slate-600">{h.type === 'ai_resume_processing' ? `consent v${h.consentVersion ?? '?'}` : `policy v${h.privacyVersion}`}{h.via === 'signup' ? ' · at sign-up' : ''}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>

      <WithdrawDialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onDone={async (stopped) => {
          setWithdrawOpen(false);
          await load();
          setNote(`AI Resume Processing has been turned off. New resume information will not be sent to the AI service.${stopped ? ` ${stopped} run${stopped === 1 ? '' : 's'} in progress will stop at the next step.` : ''}`);
        }}
      />
      <DeleteDialog
        step={deleteStep}
        setStep={setDeleteStep}
        onDone={async () => {
          setDeleteStep(0);
          await load();
          setNote('Your resume data has been deleted.');
        }}
      />
    </div>
  );
}

function Pref({ id, label, hint, checked, onChange, disabled }: { id: string; label: string; hint: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-1">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={`${id}-h`} className="mt-0.5 size-4 shrink-0 accent-brand-700 disabled:opacity-60" />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-900">
          {label}
        </label>
        <p id={`${id}-h`} className="text-[12.5px] text-slate-600">
          {hint}
        </p>
      </div>
    </div>
  );
}

function WithdrawDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (stopped: number) => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Modal open={open} onClose={onClose} labelledBy={`${id}-t`} describedBy={`${id}-d`}>
      <div className="px-5 py-6 sm:px-6">
        <h2 id={`${id}-t`} className="text-lg font-semibold text-slate-900">
          Withdraw consent?
        </h2>
        <p id={`${id}-d`} className="mt-2 text-sm leading-relaxed text-slate-700">
          New resume and job information won’t be sent to AI services. Runs in progress stop at their next step. What has already been created stays until you delete it.
        </p>
        {err && <p role="alert" className="mt-3 text-sm text-rose-700">{err}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
        <Button data-autofocus className="h-10 w-full" onClick={onClose}>
          Keep it on
        </Button>
        <Button
          variant="danger"
          className="h-10 w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.withdrawConsent();
              onDone(r.stoppedRuns ?? 0);
            } catch (e: any) {
              setErr(e.message);
            }
            setBusy(false);
          }}
        >
          Withdraw Consent
        </Button>
      </div>
    </Modal>
  );
}

function DeleteDialog({ step, setStep, onDone }: { step: 0 | 1 | 2; setStep: (s: 0 | 1 | 2) => void; onDone: () => void }) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 0) (setTyped(''), setErr(''));
    if (step === 2) setTimeout(() => input.current?.focus(), 0); // the dialog stays open between steps
  }, [step]);
  return (
    <Modal open={step > 0} onClose={() => setStep(0)} labelledBy={`${id}-t`} describedBy={`${id}-d`}>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (step === 1) return setStep(2);
          if (typed.trim() !== 'DELETE') return setErr('Type DELETE in capitals to confirm.');
          setBusy(true);
          try {
            await api.deleteData();
            onDone();
          } catch (e: any) {
            setErr(e.message);
          }
          setBusy(false);
        }}
      >
        <div className="px-5 py-6 sm:px-6">
          <h2 id={`${id}-t`} className="text-lg font-semibold text-slate-900">
            {step === 1 ? 'Delete my resume and AI-generated content' : 'Are you sure?'}
          </h2>
          {step === 1 ? (
            <p id={`${id}-d`} className="mt-2 text-sm leading-relaxed text-slate-700">
              This will permanently delete your uploaded resume, extracted resume profile, job descriptions, AI prompts, and generated resume content associated with your account. This action cannot be undone.
            </p>
          ) : (
            <>
              <p id={`${id}-d`} className="mt-2 text-sm text-slate-700">
                Type <strong>DELETE</strong> to confirm.
              </p>
              <label htmlFor={`${id}-c`} className="sr-only">
                Type DELETE to confirm
              </label>
              <input ref={input} id={`${id}-c`} value={typed} onChange={(e) => (setTyped(e.target.value), setErr(''))} autoComplete="off" className={inputCls + ' mt-3'} aria-invalid={!!err} />
            </>
          )}
          {err && (
            <p role="alert" className="mt-3 text-sm font-medium text-rose-700">
              {err}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
          <Button type="button" data-autofocus={step === 1 ? true : undefined} className="h-10 w-full" onClick={() => setStep(0)}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" className="h-10 w-full" loading={busy} icon={step === 2 ? <CheckCircle2 className="size-4" /> : undefined}>
            {step === 1 ? 'Continue' : 'Delete My Data'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
