import { useEffect, useState } from 'react';
import { sessionId } from './session';

export interface AuthUser {
  id: string;
  email: string;
  /** Set for accounts listed in the server's ADMIN_EMAILS. */
  isAdmin?: boolean;
}

export type SignupProfile = Partial<Record<'name' | 'phone' | 'location' | 'headline' | 'linkedinUrl' | 'targetRoles', string>>;

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-id': sessionId },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || res.statusText);
  return data as T;
}

export const auth = {
  /** Emails a 6-digit code. Sign-up also sends the profile details, applied when the account is created. */
  start: (email: string, mode: 'login' | 'signup', profile?: SignupProfile) => post<{ ok: true; email: string }>('/api/auth/start', { email, mode, profile }),
  /** Signs in with the one-click link from the email. */
  link: (t: string) => post<{ user: AuthUser; isNew: boolean }>('/api/auth/link', { t }),
  verify: (code: string) => post<{ user: AuthUser; isNew: boolean }>('/api/auth/verify', { code }),
  me: async (): Promise<AuthUser | null> => {
    const res = await fetch('/api/auth/me');
    return res.ok ? ((await res.json()) as { user: AuthUser }).user : null;
  },
  logout: () => post('/api/auth/logout'),
  config: () => fetch('/api/auth/config').then((r) => (r.ok ? (r.json() as Promise<{ freeModels: boolean }>) : { freeModels: false })),
};

/** Where to go after signing in: the page that sent the user to sign in, if it's one of ours. */
export function nextPath(search: string) {
  const n = new URLSearchParams(search).get('next') ?? '/';
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') && !n.startsWith('/signup') ? n : '/';
}

/**
 * On the sign-in and sign-up pages: if the visitor still has a valid session, skip the form and go straight
 * to the app (or the page they were heading to). Returns true while the check runs, so the form doesn't flash.
 */
export function useSkipIfSignedIn(search: string) {
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let live = true;
    auth
      .me()
      .then((user) => {
        if (!live) return;
        if (user) location.replace(nextPath(search)); // replace: Back shouldn't return to the sign-in form
        else setChecking(false);
      })
      .catch(() => live && setChecking(false)); // can't tell: show the form
    return () => {
      live = false;
    };
  }, [search]);
  return checking;
}
