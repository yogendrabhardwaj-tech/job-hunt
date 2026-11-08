// Mirrors server/src/types.ts
export type JobStatus = 'saved' | 'applied' | 'screening' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn';

export interface Keyword {
  term: string;
  category: 'hard' | 'soft' | 'domain' | 'tool' | 'certification';
  importance: 'high' | 'medium' | 'low';
}

export interface Analysis {
  resumeFile: string;
  score: number;
  verdict: string;
  breakdown: { required: number; preferred: number; keywords: number; experience: number };
  keywordCoverage: number;
  requirements: { text: string; type: 'must' | 'nice'; status: 'met' | 'partial' | 'missing'; evidence: string }[];
  matchedKeywords: string[];
  missingKeywords: string[];
  strengths: string[];
  gaps: { text: string; severity: 'critical' | 'major' | 'minor'; suggestion: string }[];
  recommendations: string[];
  questionsForCandidate: string[];
  at: string;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  company: string;
  status: JobStatus;
  reason: string;
}

export interface Job {
  id: string;
  duplicates?: DuplicateMatch[];
  url: string;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  salary: string;
  postingId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  jdText: string;
  details?: {
    summary: string;
    responsibilities: string[];
    mustHave: string[];
    niceToHave: string[];
    keywords: Keyword[];
    redFlags: string[];
    seniority?: string;
    yearsExperience?: string;
  };
  analysis?: Analysis;
  tailored?: { file: string; createdAt: string; changes: string[]; analysis?: Analysis };
  coverLetter?: string;
  interviewPrep?: string;
  notes: string;
  activity: { at: string; text: string; kind: 'info' | 'agent' | 'status' | 'error' }[];
  scan: { state: 'pending' | 'running' | 'done' | 'error'; error?: string };
}

export interface Profile {
  name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  linkedinUrl: string;
  linkedinText: string;
  achievements: string;
  targetRoles: string;
  masterFile: string;
  updatedAt: string;
}

export interface AgentEvent {
  at: string;
  type: 'text' | 'tool' | 'status' | 'error' | 'done';
  text: string;
  tool?: string;
}

export interface TaskSummary {
  id: string;
  kind: 'scan' | 'analyze' | 'tailor' | 'cover-letter' | 'interview-prep' | 'import-resume' | 'chat';
  jobId?: string;
  title: string;
  state: 'running' | 'done' | 'error';
  startedAt: string;
  endedAt?: string;
  error?: string;
}

export interface ResumeFile {
  file: string;
  size: number;
  updatedAt: string;
  master: boolean;
}

// ---------------------------------------------------------------- AI sources (server/src/llm/providers.ts)

export type ProviderKind = 'openrouter' | 'huggingface' | 'google' | 'lmstudio' | 'openai-compatible' | 'claude';

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  fallbackOnly: boolean;
  weight: number;
  dailyLimit: number;
  maxTokens: number;
  apiKeySet: boolean;
  apiKeyHint: string;
  usage: {
    runs: number;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    failures: number;
    totalRuns: number;
    lastUsed?: string;
    lastError?: string;
    lastErrorAt?: string;
    cooldownUntil?: string;
  };
  availability: { ok: true } | { ok: false; reason: string };
}

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  needsKey: boolean;
  keyUrl?: string;
  modelHint: string;
  note: string;
}

export interface AISettings {
  strategy: 'balanced' | 'priority';
  presets: Record<ProviderKind, ProviderPreset>;
  providers: ProviderConfig[];
}

export interface ModelInfo {
  id: string;
  tools?: boolean;
  context?: number;
  free?: boolean;
}
