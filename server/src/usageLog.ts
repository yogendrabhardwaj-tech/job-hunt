import * as storage from './storage.ts';
import { maybeUserId, userKey } from './context.ts';

/**
 * Per-user, per-day AI usage history (users/<id>/usage-log.json). The AI-sources page keeps only today's
 * counters; this keeps a rolling history so the admin page can show trends and daily averages.
 *
 * Token counts are what the provider reported. When it reported nothing (some free and local servers don't),
 * the request is estimated at about 4 characters per token and counted in estimatedRequests.
 */
export interface DayUsage {
  runs: number;
  requests: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  estimatedRequests: number;
}

export type UsageLog = Record<string, DayUsage>; // key: YYYY-MM-DD (UTC)

const FILE = 'usage-log.json';
const KEEP_DAYS = 180;

const empty = (): DayUsage => ({ runs: 0, requests: 0, failures: 0, promptTokens: 0, completionTokens: 0, estimatedRequests: 0 });
const day = () => new Date().toISOString().slice(0, 10);

export function readUsageLog(userId: string): UsageLog {
  try {
    return JSON.parse(storage.readText(userKey(FILE, userId)) ?? '{}') as UsageLog;
  } catch {
    return {};
  }
}

/** Adds to today's numbers for the signed-in user. Outside a request (no user) it does nothing. */
export function logUsage(delta: Partial<DayUsage>) {
  const uid = maybeUserId();
  if (!uid) return;
  const log = readUsageLog(uid);
  const d = (log[day()] ??= empty());
  for (const [k, v] of Object.entries(delta) as [keyof DayUsage, number][]) d[k] = (d[k] ?? 0) + (v || 0);
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const k of Object.keys(log)) if (k < cutoff) delete log[k];
  storage.writeText(userKey(FILE, uid), JSON.stringify(log));
}

/** Rough token count for text a provider didn't count for us. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4);
