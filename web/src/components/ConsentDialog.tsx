import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ExternalLink, Minus, X } from 'lucide-react';
import { api } from '../lib/api';
import { onConsentRequest, type ConsentRequest } from '../lib/consent';
import type { Disclosure, Feature, Preferences } from '../lib/types';
import { cx } from '../lib/format';
import { Modal } from './Modal';
import { Button, Skeleton } from './ui';

/** Lives in the app shell and shows the consent dialog whenever an AI request comes back without consent. */
export function ConsentHost() {
  const [open, setOpen] = useState<{ r: ConsentRequest; done: (ok: boolean) => void } | null>(null);
  useEffect(() => onConsentRequest((r, done) => setOpen({ r, done })), []);
  if (!open) return null;
  return (
    <ConsentDialog
      request={open.r}
      onDone={(ok) => {
        open.done(ok);
        setOpen(null);
      }}
    />
  );
}

const lang = () => (typeof navigator !== 'undefined' && navigator.language) || 'en';

/**
 * AI Resume Processing consent (issue #22). Everything about where data goes comes from the server's provider
 * registry; nothing about providers is written here.
 */
export function ConsentDialog({ request, onDone }: { request: ConsentRequest; onDone: (agreed: boolean) => void }) {
  const id = useId();
  const [d, setD] = useState<Disclosure | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  const load = async (includeName?: boolean) => {
    try {
      const [status, disc] = await Promise.all([api.consent(), api.disclosure(includeName)]);
      setD(disc);
      setPrefs((p) => {
        if (p) return p;
        const next = structuredClone(status.preferences);
        // the user just asked for this feature, so start with it on; they still have to agree below
        if (request.reason === 'feature_off' && request.feature && request.feature in next.features) next.features[request.feature as Feature] = true;
        return next;
      });
    } catch (e: any) {
      setLoadErr(e.message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleName = (on: boolean) => {
    setPrefs((p) => p && { ...p, includeName: on });
    load(on); // the "what we send" table changes with this choice
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!agreed) {
      setErr('Please select the checkbox to agree to AI Resume Processing.');
      box.current?.focus();
      return;
    }
    if (!d || !prefs) return;
    setBusy(true);
    setErr('');
    try {
      await api.grantConsent({ preferences: prefs, disclosureHash: d.hash, agreed: true, language: lang() });
      onDone(true);
    } catch (e: any) {
      setErr(e.message);
      if (e.status === 409) {
        setAgreed(false);
        await load(prefs.includeName);
      }
    }
    setBusy(false);
  };

  const third = d?.sources.filter((s) => s.policy.thirdParty) ?? [];
  const errId = `${id}-err`;

  return (
    <Modal open onClose={() => onDone(false)} labelledBy={`${id}-title`} describedBy={`${id}-intro`} size="lg">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-slate-900">
            AI Resume Processing
          </h2>
          <button type="button" onClick={() => onDone(false)} aria-label="Cancel and close" className="-mr-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-5" />
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <p id={`${id}-intro`} className="text-[15px] leading-relaxed text-slate-700">
            To tailor your resume for a job, our AI service analyzes the resume information and job details you provide. Nothing is sent until you agree below.
          </p>

          {request.reason && request.reason !== 'missing' && request.message && (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {request.message}
            </p>
          )}

          {loadErr && <p className="text-sm text-rose-700">Couldn’t load the details: {loadErr}</p>}
          {!d && !loadErr && (
            <div className="space-y-2" aria-busy="true" aria-label="Loading">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          )}

          {d && prefs && (
            <>
              <section aria-labelledby={`${id}-send`}>
                <h3 id={`${id}-send`} className="text-[15px] font-semibold text-slate-900">
                  What we send to the AI service
                </h3>
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                  {d.sent.map((r) => (
                    <li key={r.item} className="flex gap-3 px-3 py-2.5">
                      <span
                        className={cx(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
                          r.sent === 'yes' ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600',
                        )}
                        aria-hidden
                      >
                        {r.sent === 'yes' ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900">
                          {r.item} <span className={cx('ml-1 text-xs font-semibold', r.sent === 'yes' ? 'text-brand-800' : 'text-slate-600')}>{r.sent === 'yes' ? 'Sent' : 'Not sent'}</span>
                        </div>
                        <div className="text-[13px] leading-snug text-slate-600">{r.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby={`${id}-who`}>
                <h3 id={`${id}-who`} className="text-[15px] font-semibold text-slate-900">
                  Who processes it
                </h3>
                {d.sources.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-700">
                    You haven’t turned on an AI source yet. Add one on the{' '}
                    <Link to="/settings" className="font-medium text-brand-700 underline" onClick={() => onDone(false)}>
                      AI sources
                    </Link>{' '}
                    page. Adding one later brings you back here to review it.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-slate-700">
                      Your information may be processed by{' '}
                      {d.sources.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && (i === d.sources.length - 1 ? ' or ' : ', ')}
                          <strong className="font-semibold">{s.policy.recipient}</strong> using {s.model || 'the model you pick'}
                        </span>
                      ))}
                      .
                    </p>
                    {d.sources.length > 1 && <p className="mt-1.5 text-[13px] text-slate-600">If one is busy or fails, the request goes to the next one in this list. It never goes to a source that isn’t listed here.</p>}
                    {d.worst.training === 'may' && (
                      <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 ring-1 ring-inset ring-amber-200">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          At least one of these may keep what you send or use it to train its models. If that matters to you, turn it off on the{' '}
                          <Link to="/settings" className="font-medium underline" onClick={() => onDone(false)}>
                            AI sources
                          </Link>{' '}
                          page before agreeing.
                        </span>
                      </p>
                    )}
                    <ul className="mt-3 space-y-3">
                      {d.sources.map((s) => (
                        <li key={s.id} className="rounded-xl px-3 py-3 ring-1 ring-slate-200">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                            <span className="truncate font-mono text-xs text-slate-600">{s.model}</span>
                          </div>
                          {s.fallbackOnly && <div className="text-xs text-slate-600">Used only when your other sources are unavailable</div>}
                          <dl className="mt-2 space-y-1.5 text-[13px] leading-snug text-slate-700">
                            <div>
                              <dt className="inline font-medium text-slate-900">Training: </dt>
                              <dd className="inline">{s.policy.trainingText}</dd>
                            </div>
                            <div>
                              <dt className="inline font-medium text-slate-900">Keeping data: </dt>
                              <dd className="inline">{s.policy.retentionText}</dd>
                            </div>
                            {s.policy.humanReview && (
                              <div>
                                <dt className="inline font-medium text-slate-900">People reading it: </dt>
                                <dd className="inline">{s.policy.humanReview}</dd>
                              </div>
                            )}
                          </dl>
                          {(s.policy.privacyUrl || s.policy.termsUrl) && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                              {s.policy.privacyUrl && <ExtLink href={s.policy.privacyUrl}>Privacy policy</ExtLink>}
                              {s.policy.termsUrl && <ExtLink href={s.policy.termsUrl}>Data terms</ExtLink>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    {third.length === 0 && <p className="mt-2 text-[13px] text-slate-600">All of your sources run on this computer, so nothing goes to a third party.</p>}
                  </>
                )}
                <p className="mt-3 text-[13px] leading-snug text-slate-600">
                  <strong className="font-medium text-slate-800">Web search.</strong> {d.webSearch.text} <ExtLink href={d.webSearch.privacyUrl}>DuckDuckGo privacy</ExtLink>
                </p>
              </section>

              <fieldset>
                <legend className="text-[15px] font-semibold text-slate-900">Your choices</legend>
                <p className="mt-1 text-[13px] text-slate-600">You can change these later on the Privacy page.</p>
                <div className="mt-3 space-y-2.5">
                  <Toggle id={`${id}-name`} checked={prefs.includeName} onChange={toggleName} label="Include my name in AI processing" hint="Off: the AI sees a placeholder, and your name is put back on our server." />
                  <Toggle id={`${id}-contact`} checked={false} disabled onChange={() => {}} label="Include contact details in AI processing" hint="Always off. Tailoring doesn’t need your email, phone or address." />
                  {(Object.keys(d.features) as Feature[]).map((f) => (
                    <Toggle
                      key={f}
                      id={`${id}-${f}`}
                      checked={prefs.features[f]}
                      onChange={(on) => setPrefs((p) => p && { ...p, features: { ...p.features, [f]: on } })}
                      label={`Use AI for: ${d.features[f].label}`}
                      hint={d.features[f].description}
                      highlight={request.reason === 'feature_off' && request.feature === f}
                    />
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <div className="flex items-start gap-3">
            <input
              ref={box}
              id={`${id}-agree`}
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setErr('');
              }}
              aria-invalid={!!err && !agreed}
              aria-describedby={err ? errId : undefined}
              className="mt-0.5 size-[18px] shrink-0 accent-brand-700"
            />
            <label htmlFor={`${id}-agree`} className="text-[13.5px] leading-snug text-slate-800">
              I understand that my selected resume and job information will be sent to the AI services listed above for AI resume tailoring. I have read the{' '}
              <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline">
                Privacy Policy
              </a>
              {d?.versions.termsVersion && (
                <>
                  {' '}and{' '}
                  <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline">
                    Terms of Service
                  </a>
                </>
              )}
              .
            </label>
          </div>
          <p id={errId} role="alert" aria-live="assertive" className={cx('text-sm font-medium text-rose-700', err ? 'mt-2' : 'sr-only')}>
            {err && (
              <>
                <AlertTriangle className="mr-1 inline size-4 align-[-3px]" aria-hidden />
                {err}
              </>
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button type="button" className="h-10 w-full text-[14px]" onClick={() => onDone(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              aria-disabled={!agreed || !d}
              className={cx('h-10 w-full text-[14px]', (!agreed || !d) && 'opacity-60')}
            >
              Agree and Continue
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Toggle({ id, label, hint, checked, onChange, disabled, highlight }: { id: string; label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; highlight?: boolean }) {
  return (
    <div className={cx('flex items-start gap-3 rounded-lg px-2 py-1.5', highlight && 'bg-brand-50 ring-1 ring-inset ring-brand-200')}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} className="mt-0.5 size-4 shrink-0 accent-brand-700 disabled:opacity-60" />
      <div className="min-w-0">
        <label htmlFor={id} className={cx('text-sm font-medium', disabled ? 'text-slate-500' : 'text-slate-900')}>
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-[12.5px] leading-snug text-slate-600">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-700 underline">
      {children}
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
