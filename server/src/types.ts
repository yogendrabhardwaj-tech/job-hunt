export type JobStatus =
  | 'saved'
  | 'applied'
  | 'screening'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export const JOB_STATUSES: JobStatus[] = [
  'saved',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
];

export interface Keyword {
  term: string;
  category: 'hard' | 'soft' | 'domain' | 'tool' | 'certification';
  importance: 'high' | 'medium' | 'low';
}

export interface JobDetails {
  summary: string;
  responsibilities: string[];
  mustHave: string[];
  niceToHave: string[];
  keywords: Keyword[];
  redFlags: string[];
  seniority?: string;
  yearsExperience?: string;
}

export interface RequirementMatch {
  text: string;
  type: 'must' | 'nice';
  status: 'met' | 'partial' | 'missing';
  evidence: string;
}

export interface Gap {
  text: string;
  severity: 'critical' | 'major' | 'minor';
  suggestion: string;
}

export interface Analysis {
  resumeFile: string;
  score: number;
  verdict: string;
  breakdown: { required: number; preferred: number; keywords: number; experience: number };
  keywordCoverage: number;
  requirements: RequirementMatch[];
  matchedKeywords: string[];
  missingKeywords: string[];
  strengths: string[];
  gaps: Gap[];
  recommendations: string[];
  questionsForCandidate: string[];
  at: string;
}

export interface ActivityItem {
  at: string;
  text: string;
  kind: 'info' | 'agent' | 'status' | 'error';
}

export interface Job {
  id: string;
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
  details?: JobDetails;
  analysis?: Analysis;
  tailored?: {
    file: string;
    createdAt: string;
    changes: string[];
    analysis?: Analysis;
  };
  coverLetter?: string;
  interviewPrep?: string;
  notes: string;
  activity: ActivityItem[];
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

export interface DB {
  seq: number;
  profile: Profile;
  jobs: Job[];
}

export type TaskKind =
  | 'scan'
  | 'analyze'
  | 'tailor'
  | 'cover-letter'
  | 'interview-prep'
  | 'import-resume'
  | 'chat';

export interface AgentEvent {
  at: string;
  type: 'text' | 'tool' | 'status' | 'error' | 'done';
  text: string;
  tool?: string;
}

export interface Task {
  id: string;
  kind: TaskKind;
  jobId?: string;
  title: string;
  state: 'running' | 'done' | 'error';
  startedAt: string;
  endedAt?: string;
  events: AgentEvent[];
  error?: string;
}
