import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, FileText, Link2, Mail, Upload, X } from 'lucide-react';
import { auth, useSkipIfSignedIn, type SignupProfile } from '../lib/auth';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { AuthShell, CodeStep, FormError } from '../components/AuthShell';
import { Button, inputCls } from '../components/ui';
import { PolicyModal, usePolicy } from './PrivacyPolicy';

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const MAX_FILE = 15 * 1024 * 1024;

/** Create an account: basic details, optional LinkedIn profile and resume, then an emailed code. */
export function SignupPage() {
  const loc = useLocation();
  const [email, setEmail] = useState(() => new URLSearchParams(loc.search).get('email') ?? '');
  const [p, setP] = useState<SignupProfile>({});
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const checking = useSkipIfSignedIn(loc.search);
  const set = (k: keyof SignupProfile) => (e: React.ChangeEvent<HTMLInputElement>) => setP((x) => ({ ...x, [k]: e.target.value }));
  // Privacy Policy section (issue #25)
  const { doc: policy, err: policyErr } = usePolicy();
  const [ack, setAck] = useState(false);
  const [adult, setAdult] = useState(false);
  const [ackErr, setAckErr] = useState('');
  const [viewPolicy, setViewPolicy] = useState(false);
  const [copy, setCopy] = useState<{ state: 'idle' | 'sending' | 'sent' | 'error'; msg: string; sentAt?: string }>({ state: 'idle', msg: '' });
  const ackRef = useRef<HTMLInputElement>(null);
  const adultRef = useRef<HTMLInputElement>(null);

  const send = async () => {
    // the profile keeps one name field, used on resumes and in greetings
    const r = await auth.start(
      email,
      'signup',
      { ...p, name: `${first.trim()} ${last.trim()}`.trim() },
      { version: policy!.version, acknowledged: true, ageConfirmed: true, language: navigator.language || 'en', ...(copy.sentAt ? { copySentAt: copy.sentAt } : {}) },
    );
    setSentTo(r.email);
  };

  const emailCopy = async () => {
    if (!validEmail(email)) return setCopy({ state: 'error', msg: 'Please enter a valid email address to receive a copy of the Privacy Policy.' });
    setCopy({ state: 'sending', msg: '' });
    try {
      const r = await api.emailPolicyCopy(email);
      setCopy({ state: 'sent', msg: r.message, sentAt: r.sentAt });
    } catch (e: any) {
      setCopy({ state: 'error', msg: e.message || 'We could not send the Privacy Policy. Please try again.' });
    }
  };

  /** The acknowledgment checks run first, so the message points at the box that needs ticking. */
  const ackProblem = () => {
    if (!policy) return { msg: policyErr || 'Privacy Policy is temporarily unavailable. Please try again later.', ref: null };
    if (!ack) return { msg: 'Please accept the Privacy Policy to continue.', ref: ackRef };
    if (!adult) return { msg: 'Please confirm that you are 18 or older.', ref: adultRef };
    return null;
  };

  if (checking) return null; // already signed in: on the way to the app

  if (sentTo)
    return (
      <AuthShell title="Check your email">
        <CodeStep
          email={sentTo}
          busyLabel={resume ? 'Creating account and uploading…' : 'Creating your account…'}
          onVerify={async (code) => {
            await auth.verify(code);
            if (resume) {
              // signed in now. The file is stored and its text extracted on our server, but nothing goes to an AI
              // service until the user agrees on the Profile page (or chooses to use it as it is).
              const fd = new FormData();
              fd.append('file', resume);
              fd.append('mode', 'defer');
              await api.importResume(fd).catch(() => {});
              location.assign('/profile');
            } else location.assign('/');
          }}
          onResend={send}
          onChangeEmail={() => setSentTo('')}
        />
      </AuthShell>
    );

  return (
    <AuthShell
      title="Create your account"
      sub="Tell us a little about yourself. You can change any of this later on your profile."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const problem = ackProblem();
          if (problem) {
            setAckErr(problem.msg);
            problem.ref?.current?.focus();
            return;
          }
          setBusy(true);
          setErr('');
          try {
            await send();
          } catch (e: any) {
            setErr(e.message);
          }
          setBusy(false);
        }}
        className="space-y-4"
      >
        <FormError msg={err} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <input required autoFocus autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Last name" required>
            <input required autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Email" required hint="We’ll send a sign-in link here">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input type="tel" autoComplete="tel" value={p.phone ?? ''} onChange={set('phone')} className={inputCls} />
          </Field>
          <Field label="Location">
            <input autoComplete="address-level2" value={p.location ?? ''} onChange={set('location')} placeholder="City, State" className={inputCls} />
          </Field>
        </div>
        <Field label="Current title">
          <input value={p.headline ?? ''} onChange={set('headline')} placeholder="e.g. Senior Data Engineer" className={inputCls} />
        </Field>
        <Field label="Roles you’re looking for">
          <input value={p.targetRoles ?? ''} onChange={set('targetRoles')} placeholder="e.g. Staff Engineer, Engineering Manager" className={inputCls} />
        </Field>

        <Field label="LinkedIn profile" hint="Optional">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              inputMode="url"
              value={p.linkedinUrl ?? ''}
              onChange={set('linkedinUrl')}
              onBlur={(e) => {
                // accept "linkedin.com/in/…" without the https://
                const v = e.target.value.trim();
                if (v && !/^https?:\/\//i.test(v)) setP((x) => ({ ...x, linkedinUrl: `https://${v}` }));
              }}
              placeholder="https://www.linkedin.com/in/your-name"
              className={inputCls + ' pl-9'}
            />
          </div>
        </Field>

        <div>
          <span className="mb-1 block text-xs font-medium text-slate-700">
            Resume <span className="font-normal text-slate-500">· Optional. PDF, Word, text or Markdown</span>
          </span>
          {resume ? (
            <div className="flex items-center gap-3 rounded-lg p-3 ring-1 ring-inset ring-slate-200">
              <FileText className="size-5 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800">{resume.name}</div>
                <div className="text-xs text-slate-500">Saved to your account when you confirm your email. It’s only sent to an AI service after you agree to that.</div>
              </div>
              <button type="button" aria-label="Remove resume" onClick={() => setResume(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm font-medium text-slate-600 hover:border-brand-400 hover:bg-brand-50/40"
            >
              <Upload className="size-4" /> Upload your resume
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > MAX_FILE) return setErr('That file is over 15 MB. Choose a smaller one.');
              setErr('');
              setResume(f);
            }}
          />
        </div>

        <section aria-labelledby="privacy-h" className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <h2 id="privacy-h" className="text-sm font-semibold text-slate-900">
            Privacy Policy
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-slate-700">
            Before creating your account, please review how we collect, use, share and protect your personal information, how long we keep it, and your rights.
          </p>
          {policy && (
            <p className="mt-1 text-xs text-slate-600">
              Version {policy.version} · effective {policy.effectiveDate}
            </p>
          )}
          {policyErr && <p className="mt-1 text-xs font-medium text-rose-700">{policyErr}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setViewPolicy(true)} disabled={!!policyErr}>
              View Privacy Policy
            </Button>
            <Button type="button" size="sm" variant="ghost" icon={<Mail className="size-3.5" />} loading={copy.state === 'sending'} onClick={emailCopy} disabled={!!policyErr}>
              Email me a copy
            </Button>
          </div>
          <p role="status" aria-live="polite" className={cx('text-[13px]', copy.msg ? 'mt-2' : 'sr-only', copy.state === 'error' ? 'text-rose-700' : 'text-emerald-800')}>
            {copy.msg}
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2.5">
              <input
                ref={ackRef}
                id="privacy-policy-consent"
                type="checkbox"
                checked={ack}
                onChange={(e) => (setAck(e.target.checked), setAckErr(''))}
                aria-describedby={ackErr ? 'privacy-ack-error' : undefined}
                aria-invalid={!!ackErr && !ack}
                className="mt-0.5 size-[18px] shrink-0 accent-brand-700"
              />
              <label htmlFor="privacy-policy-consent" className="text-[13.5px] leading-snug text-slate-800">
                I have reviewed the Privacy Policy and understand how my personal information may be collected, used, and shared.
              </label>
            </div>
            <div className="flex items-start gap-2.5">
              <input
                ref={adultRef}
                id="age-confirm"
                type="checkbox"
                checked={adult}
                onChange={(e) => (setAdult(e.target.checked), setAckErr(''))}
                aria-describedby={ackErr ? 'privacy-ack-error' : undefined}
                aria-invalid={!!ackErr && ack && !adult}
                className="mt-0.5 size-[18px] shrink-0 accent-brand-700"
              />
              <label htmlFor="age-confirm" className="text-[13.5px] leading-snug text-slate-800">
                I’m 18 or older.
              </label>
            </div>
          </div>
          <p id="privacy-ack-error" role="alert" aria-live="assertive" className={cx('text-sm font-medium text-rose-700', ackErr ? 'mt-2' : 'sr-only')}>
            {ackErr && (
              <>
                <AlertTriangle className="mr-1 inline size-4 align-[-3px]" aria-hidden />
                {ackErr}
              </>
            )}
          </p>
        </section>

        <Button type="submit" variant="primary" className={cx('w-full', !(ack && adult && policy) && 'opacity-60')} aria-disabled={!(ack && adult && policy)} loading={busy}>
          Create account
        </Button>
        <p className="text-center text-xs text-slate-500">No password needed. We’ll email you a link that signs you in with one click, plus a code you can type instead.</p>
      </form>
      <PolicyModal open={viewPolicy} onClose={() => setViewPolicy(false)} />
    </AuthShell>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
        {hint && <span className="font-normal text-slate-500"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}
