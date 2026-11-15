import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth, nextPath } from '../lib/auth';
import { AuthShell, CodeStep, FormError } from '../components/AuthShell';
import { Button, inputCls } from '../components/ui';

/** Sign in with an emailed code; no password. */
export function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const noAccount = /no account/i.test(err);

  const send = async () => {
    const r = await auth.start(email, 'login');
    setSentTo(r.email);
  };

  return (
    <AuthShell
      title={sentTo ? 'Check your email' : 'Sign in'}
      sub={sentTo ? undefined : 'Enter your email and we’ll send you a code. No password needed.'}
      footer={
        <>
          New here?{' '}
          <Link to={`/signup${loc.search}`} className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {sentTo ? (
        <CodeStep
          email={sentTo}
          onVerify={async (code) => {
            await auth.verify(code);
            location.assign(nextPath(loc.search)); // full load so every page starts with the new session
          }}
          onResend={send}
          onChangeEmail={() => setSentTo('')}
        />
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr('');
            try {
              await send();
            } catch (e: any) {
              setErr(e.message);
            }
            setBusy(false);
          }}
        >
          <FormError msg={err} />
          {noAccount && (
            <Button type="button" className="-mt-2 mb-4 w-full" onClick={() => nav(`/signup?email=${encodeURIComponent(email)}`)}>
              Sign up with {email}
            </Button>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Email</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          </label>
          <Button type="submit" variant="primary" className="mt-4 w-full" loading={busy}>
            Email me a code
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
