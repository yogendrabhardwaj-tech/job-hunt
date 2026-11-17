import { sessionId } from './session';
import { ConsentDeclinedError, isConsentRequired, requestConsent } from './consent';
import type { AdminOverview, AISettings, ConsentHistory, ConsentStatus, Disclosure, DuplicateMatch, Job, ModelInfo, Preferences, Profile, ProviderConfig, ResumeFile, TaskSummary } from './types';

async function req<T>(method: string, url: string, body?: unknown, retried = false): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: { 'x-session-id': sessionId, ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // signed out (or the session expired): go to sign-in, then come back here
  if (res.status === 401 && (data as any).code === 'auth' && !/^\/(login|signup)/.test(location.pathname)) {
    location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  // no AI consent (or the feature is off): show the consent dialog, and retry once if the user agrees
  if (res.status === 403 && isConsentRequired(data)) {
    if (!retried && (await requestConsent(data as any))) return req<T>(method, url, body, true);
    throw new ConsentDeclinedError((data as any).message || 'AI Resume Processing is off.');
  }
  if (!res.ok) {
    const e: any = new Error((data as any).error || res.statusText);
    e.code = (data as any).code;
    e.status = res.status;
    throw e;
  }
  return data as T;
}

/** For pages that work signed out (Privacy Policy, sign-up). */
async function pub<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || res.statusText);
  return data as T;
}

export interface PolicyDoc {
  title: string;
  version: string;
  effectiveDate: string;
  draft: boolean;
  markdown: string;
}

export const api = {
  meta: () => req<{ model: string }>('GET', '/api/meta'),
  adminOverview: (days: 7 | 30 | 90) => req<AdminOverview>('GET', `/api/admin/overview?days=${days}`),
  profile: () => req<{ profile: Profile; master: string; pendingImport: { chars: number; at: string } | null }>('GET', '/api/profile'),
  saveProfile: (p: Partial<Profile>) => req<Profile>('PUT', '/api/profile', p),
  importResume: (fd: FormData) => req<{ task?: TaskSummary; pending?: boolean; saved?: 'as-is' }>('POST', '/api/profile/import', fd),
  pendingImport: (mode: 'ai' | 'asis' | 'discard') => req<{ task?: TaskSummary; saved?: 'as-is'; ok?: boolean }>('POST', '/api/profile/import/pending', { mode }),
  uploadLinkedin: (fd: FormData) => req<Profile>('POST', '/api/profile/linkedin', fd),

  resumes: () => req<ResumeFile[]>('GET', '/api/resumes'),
  resume: (file: string) => req<{ file: string; content: string }>('GET', `/api/resumes/${encodeURIComponent(file)}`),
  saveResume: (file: string, content: string) => req('PUT', `/api/resumes/${encodeURIComponent(file)}`, { content }),

  jobs: () => req<Job[]>('GET', '/api/jobs'),
  job: (id: string) => req<Job>('GET', `/api/jobs/${id}`),
  checkJob: (url: string) => req<{ postingId: string; duplicates: DuplicateMatch[] }>('POST', '/api/jobs/check', { url }),
  createJob: (url: string, jdText?: string) => req<Job>('POST', '/api/jobs', { url, jdText }),
  updateJob: (id: string, patch: Partial<Job>) => req<Job>('PATCH', `/api/jobs/${id}`, patch),
  deleteJob: (id: string) => req('DELETE', `/api/jobs/${id}`),
  action: (id: string, action: 'rescan' | 'analyze' | 'tailor' | 'cover-letter' | 'interview-prep', body?: Record<string, unknown>) =>
    req<{ task: TaskSummary }>('POST', `/api/jobs/${id}/${action}`, body ?? {}),

  tasks: () => req<TaskSummary[]>('GET', '/api/tasks'),

  settings: () => req<AISettings>('GET', '/api/settings'),
  saveSettings: (patch: { strategy?: AISettings['strategy']; order?: string[] }) => req<AISettings>('PUT', '/api/settings', patch),
  addSource: (p: Partial<ProviderConfig> & { apiKey?: string }) => req<AISettings>('POST', '/api/settings/providers', p),
  updateSource: (id: string, p: Partial<ProviderConfig> & { apiKey?: string }) => req<AISettings>('PUT', `/api/settings/providers/${id}`, p),
  forgetKey: (id: string) => req<AISettings>('DELETE', `/api/settings/providers/${id}/key`),
  deleteSource: (id: string) => req<AISettings>('DELETE', `/api/settings/providers/${id}`),
  models: (q: { id?: string; kind: string; baseUrl?: string; apiKey?: string }) => req<ModelInfo[]>('POST', '/api/settings/models', q),
  consent: () => req<ConsentStatus & { history: ConsentHistory[] }>('GET', '/api/consent'),
  disclosure: (includeName?: boolean) => req<Disclosure>('GET', `/api/privacy/disclosure${includeName === undefined ? '' : `?includeName=${includeName ? 1 : 0}`}`),
  grantConsent: (b: { preferences: Preferences; disclosureHash: string; agreed: true; language: string }) => req<ConsentStatus>('POST', '/api/consent', b),
  updatePreferences: (preferences: Preferences) => req<ConsentStatus>('PUT', '/api/consent/preferences', { preferences }),
  withdrawConsent: () => req<ConsentStatus & { stoppedRuns: number }>('POST', '/api/consent/withdraw'),
  acknowledgePrivacy: (b: { version: string; acknowledged: true; ageConfirmed: true; language: string }) => req<ConsentStatus>('POST', '/api/privacy/acknowledge', b),
  deleteData: () => req<{ ok: true; completedAt: string; deleted: { resumes: number; uploads: number } }>('POST', '/api/privacy/delete-data', { confirm: 'DELETE' }),
  privacyPolicy: () => pub<PolicyDoc>('GET', '/api/privacy/policy'),
  emailPolicyCopy: (email: string) => pub<{ status: 'sent'; message: string; sentAt: string }>('POST', '/api/privacy/email-copy', { email }),

  testSource: (id: string) =>
    req<{ ok: boolean; toolCalling: boolean; latencyMs: number; reply?: string; error?: string }>('POST', `/api/settings/providers/${id}/test`),
};
