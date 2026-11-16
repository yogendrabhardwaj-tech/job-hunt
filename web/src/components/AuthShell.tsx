import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, MailCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, inputCls } from './ui';
import { BrandMark, ThemeSwitcher } from './ThemeSwitcher';

/** Centered card used by the sign-in and sign-up pages, on the same night background as the home page. */
export function AuthShell({ title, sub, children, footer }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-night text-[#c4cbe0] antialiased">
      <div aria-hidden className="jha-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[300px] left-1/2 h-[700px] w-[900px] -translate-x-1/2 opacity-50"
        style={{ background: 'radial-gradient(closest-side, var(--jha-glow), transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[220px] bottom-[-220px] size-[560px] opacity-70"
        style={{ background: 'radial-gradient(closest-side, rgba(var(--jha-sec-rgb),0.18), transparent)' }}
      />

      <header className="relative mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-6 py-[18px]">
        <Link to="/" className="flex items-center gap-2.5 text-white">
          <BrandMark className="size-[34px] rounded-[10px]" />
          <span className="font-display text-[17px] font-semibold tracking-[-0.01em]">Job Hunt Alpha</span>
        </Link>
        <ThemeSwitcher />
      </header>

      <main className="relative flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-[460px]">
          <div className="rounded-[20px] p-px shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.08))' }}>
            <div className="rounded-[19px] bg-white p-6 text-slate-800 sm:p-8">
              <h1 className="font-display text-[26px] font-semibold tracking-[-0.03em] text-slate-900">{title}</h1>
              {sub && <p className="mt-1.5 text-sm text-slate-600">{sub}</p>}
              <div className="mt-6">{children}</div>
              {footer && <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">{footer}</div>}
            </div>
          </div>
        </div>
      </main>
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
