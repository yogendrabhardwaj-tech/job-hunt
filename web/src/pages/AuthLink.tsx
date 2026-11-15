import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { auth } from '../lib/auth';
import { AuthShell, FormError } from '../components/AuthShell';

/** Landing page for the one-click sign-in link in the email: signs in, then opens the app. */
export function AuthLinkPage() {
  const loc = useLocation();
  const [err, setErr] = useState('');
  const started = useRef(false); // the link works once; don't send it twice in development's double render

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = new URLSearchParams(loc.search).get('t') ?? '';
    // drop the token from the address bar and history
    history.replaceState(null, '', '/auth/link');
    auth
      .link(t)
      .then(({ isNew }) => location.replace(isNew ? '/profile' : '/'))
      .catch((e) => setErr(e.message));
  }, [loc.search]);

  return (
    <AuthShell title={err ? 'Couldn’t sign you in' : 'Signing you in…'}>
      {err ? (
        <>
          <FormError msg={err} />
          <Link to="/login" className="text-sm font-medium text-brand-700 hover:underline">
            Get a new link
          </Link>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" /> Checking your link…
        </div>
      )}
    </AuthShell>
  );
}
