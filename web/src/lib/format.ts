import type { JobStatus } from './types';

export function timeAgo(iso?: string) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const STATUS_META: Record<JobStatus, { label: string; dot: string; pill: string }> = {
  saved: { label: 'Saved', dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-700 ring-slate-200' },
  applied: { label: 'Applied', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-800 ring-sky-200' },
  screening: { label: 'Screening', dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-800 ring-violet-200' },
  interviewing: { label: 'Interviewing', dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-800 ring-indigo-200' },
  offer: { label: 'Offer', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  rejected: { label: 'Rejected', dot: 'bg-rose-400', pill: 'bg-rose-50 text-rose-800 ring-rose-200' },
  withdrawn: { label: 'Withdrawn', dot: 'bg-slate-300', pill: 'bg-slate-50 text-slate-500 ring-slate-200' },
};

export const STATUSES = Object.keys(STATUS_META) as JobStatus[];

/** Match bands from the job-description-analyzer playbook. */
export function band(score?: number) {
  if (score == null) return { label: 'Not scored', tone: 'text-slate-400', stroke: '#cbd5e1', bar: 'bg-slate-300' };
  if (score >= 75) return { label: 'Excellent fit', tone: 'text-emerald-700', stroke: '#059669', bar: 'bg-emerald-500' };
  if (score >= 60) return { label: 'Good fit', tone: 'text-brand-700', stroke: '#4f46e5', bar: 'bg-brand-500' };
  if (score >= 50) return { label: 'Stretch', tone: 'text-amber-700', stroke: '#d97706', bar: 'bg-amber-500' };
  return { label: 'Low match', tone: 'text-rose-700', stroke: '#e11d48', bar: 'bg-rose-500' };
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
