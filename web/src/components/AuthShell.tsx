import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, MailCheck } from 'lucide-react';
import { Button, inputCls } from './ui';

/** Centered card used by the sign-in and sign-up pages. */
export function AuthShell({ title, sub, children, footer }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10 sm:items-center">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/30">
            <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
              <path d="M7 22l5-11 4 7 2.5-3.5L25 22" stroke="white" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">Job Hunt Alpha</span>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {sub && <p className="mt-1.5 text-sm text-slate-600">{sub}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </div>
  );
}

export function FormError({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
      <CircleAlert className="mt-0.5 size-4 shrink-0" /> {msg}
    </div>
  );
}

/** Second step of sign-in and sign-up: enter the 6-digit code that was emailed. */
export function CodeStep({
  email,
  onVerify,
  onResend,
  onChangeEmail,
  busyLabel = 'Signing in…',
}: {
  email: string;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
  busyLabel?: string;
}) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onVerify(c);
    } catch (e: any) {
      setErr(e.message);
      setCode('');
      ref.current?.focus();
    }
    setBusy(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="mb-5 flex items-start gap-3 rounded-lg bg-brand-50 p-3 text-sm text-slate-700 ring-1 ring-inset ring-brand-100">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <span>
          We emailed <b className="break-all">{email}</b> a sign-in link and a 6-digit code. Click the link to sign in automatically (it works for 5&nbsp;minutes), or enter the code here (10&nbsp;minutes). Check your spam folder if you don’t see it.
        </span>
      </div>
      <FormError msg={err} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Code</span>
        <input
          ref={ref}
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => {
            // no maxLength: a pasted "482 915" is 7 characters, and the browser would cut the last digit
            // before the space is removed. Keep the digits, then take six.
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) submit(v); // pasted or typed the last digit
          }}
          placeholder="123456"
          className={inputCls + ' text-center font-mono text-2xl tracking-[0.5em]'}
        />
      </label>
      <Button type="submit" variant="primary" className="mt-4 w-full" loading={busy} disabled={code.length !== 6}>
        {busy ? busyLabel : 'Continue'}
      </Button>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button type="button" onClick={onChangeEmail} className="font-medium text-slate-600 hover:text-slate-900 hover:underline">
          Use a different email
        </button>
        <button
          type="button"
          disabled={resent}
          onClick={async () => {
            setErr('');
            try {
              await onResend();
              setResent(true);
              setTimeout(() => setResent(false), 30_000);
            } catch (e: any) {
              setErr(e.message);
            }
          }}
          className="font-medium text-brand-700 hover:underline disabled:text-slate-400 disabled:no-underline"
        >
          {resent ? 'New code sent' : 'Send a new code'}
        </button>
      </div>
    </form>
  );
}
