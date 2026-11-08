import type { AISettings, DuplicateMatch, Job, ModelInfo, Profile, ProviderConfig, ResumeFile, TaskSummary } from './types';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { 'content-type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || res.statusText);
  return data as T;
}

export const api = {
  meta: () => req<{ model: string }>('GET', '/api/meta'),
  profile: () => req<{ profile: Profile; master: string }>('GET', '/api/profile'),
  saveProfile: (p: Partial<Profile>) => req<Profile>('PUT', '/api/profile', p),
  importResume: (fd: FormData) => req<{ task: TaskSummary }>('POST', '/api/profile/import', fd),
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
  deleteSource: (id: string) => req<AISettings>('DELETE', `/api/settings/providers/${id}`),
  models: (q: { id?: string; kind: string; baseUrl?: string; apiKey?: string }) => req<ModelInfo[]>('POST', '/api/settings/models', q),
  testSource: (id: string) =>
    req<{ ok: boolean; toolCalling: boolean; latencyMs: number; reply?: string; error?: string }>('POST', `/api/settings/providers/${id}/test`),
};
