import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';

/** Shown for unknown addresses, and in place of the router's developer error screen. */
export function NotFoundPage() {
  const error = useRouteError();
  const missing = !error || (isRouteErrorResponse(error) && error.status === 404);
  if (error && !missing) console.error(error);
  return (
    <AuthShell
      title={missing ? 'Page not found' : 'Something went wrong'}
      sub={missing ? 'That address doesn’t match any page here. It may be an old or mistyped link.' : 'This page hit an error. Reloading usually fixes it.'}
    >
      <div className="flex gap-4 text-sm">
        <Link to="/" className="font-medium text-brand-700 hover:underline">
          Go to the home page
        </Link>
        {!missing && (
          <button type="button" onClick={() => location.reload()} className="font-medium text-slate-600 hover:underline">
            Reload
          </button>
        )}
      </div>
    </AuthShell>
  );
}
