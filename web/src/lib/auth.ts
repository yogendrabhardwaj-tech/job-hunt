import { sessionId } from './session';

export interface AuthUser {
  id: string;
  email: string;
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
