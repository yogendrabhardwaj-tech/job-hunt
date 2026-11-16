import type { Express, NextFunction, Request, Response } from 'express';
import * as storage from './storage.ts';
import { currentUser } from './context.ts';
import { isAdmin, listUsers } from './auth.ts';
import { readUsageLog, type DayUsage } from './usageLog.ts';
import type { DB } from './types.ts';

/**
 * Admin-only overview of every customer: activity counts read from each user's saved data, plus AI usage from
 * their daily usage log. Read-only; it never changes anyone's data.
 */

const dayOf = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const lastDays = (n: number) => {
  const out: string[] = [];
  const t = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(new Date(t - i * 86_400_000).toISOString().slice(0, 10));
  return out;
};
const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = storage.readText(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(currentUser().email)) return void res.status(403).json({ error: 'Admins only' });
  next();
}

export interface DailyRow {
  date: string;
  rolesAdded: number;
  resumesTailored: number;
  runs: number;
  requests: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  activeCustomers: number;
}

function overview(days: number) {
  const range = lastDays(days);
  const inRange = new Set(range);
  const daily = new Map<string, DailyRow & { users: Set<string> }>(
    range.map((d) => [d, { date: d, rolesAdded: 0, resumesTailored: 0, runs: 0, requests: 0, failures: 0, promptTokens: 0, completionTokens: 0, activeCustomers: 0, users: new Set() }]),
  );
  const since7 = lastDays(7)[0];

  const customers = listUsers().map((u) => {
    const db = readJson<Partial<DB>>(`users/${u.id}/db.json`, {});
    const jobs = db.jobs ?? [];
    const profile = db.profile;
    const resumeFiles = storage.listFiles(`users/${u.id}/resumes/`);
    const log = readUsageLog(u.id);
    const settings = readJson<{ usage?: Record<string, { totalRuns?: number }> }>(`users/${u.id}/settings.json`, {});

    // per-day activity into the shared daily table
    const touch = (d: string, f: (r: DailyRow) => void) => {
      const r = daily.get(d);
      if (!r) return;
      f(r);
      r.users.add(u.id);
    };
    for (const j of jobs) {
      touch(dayOf(j.createdAt), (r) => r.rolesAdded++);
      if (j.tailored) touch(dayOf(j.tailored.createdAt), (r) => r.resumesTailored++);
    }
    const ai = { runs: 0, requests: 0, failures: 0, promptTokens: 0, completionTokens: 0, estimatedRequests: 0, activeDays: 0, rangeTokens: 0, rangeRequests: 0 };
    for (const [d, v] of Object.entries(log) as [string, DayUsage][]) {
      ai.runs += v.runs;
      ai.requests += v.requests;
      ai.failures += v.failures;
      ai.promptTokens += v.promptTokens;
      ai.completionTokens += v.completionTokens;
      ai.estimatedRequests += v.estimatedRequests;
      if (v.requests > 0) ai.activeDays++;
      if (inRange.has(d)) {
        ai.rangeTokens += v.promptTokens + v.completionTokens;
        ai.rangeRequests += v.requests;
        if (v.requests > 0 || v.runs > 0)
          touch(d, (r) => {
            r.runs += v.runs;
            r.requests += v.requests;
            r.failures += v.failures;
            r.promptTokens += v.promptTokens;
            r.completionTokens += v.completionTokens;
          });
      }
    }
    const tokens = ai.promptTokens + ai.completionTokens;
    const lastActive = [
      u.createdAt,
      profile?.updatedAt,
      ...jobs.map((j) => j.updatedAt),
      ...resumeFiles.map((f) => f.updatedAt),
      ...Object.keys(log).map((d) => d + 'T12:00:00.000Z'),
    ]
      .filter(Boolean)
      .sort()
      .pop();

    return {
      id: u.id,
      email: u.email,
      name: profile?.name ?? '',
      createdAt: u.createdAt,
      lastActive: lastActive ?? u.createdAt,
      hasMaster: resumeFiles.some((f) => f.key.endsWith('/' + (profile?.masterFile ?? 'master_resume.md'))),
      roles: jobs.length,
      analyzed: jobs.filter((j) => j.analysis).length,
      resumesTailored: jobs.filter((j) => j.tailored).length,
      coverLetters: jobs.filter((j) => j.coverLetter).length,
      interviewPreps: jobs.filter((j) => j.interviewPrep).length,
      applied: jobs.filter((j) => j.appliedAt || j.status !== 'saved').length,
      resumeFiles: resumeFiles.length,
      ai: {
        runs: ai.runs,
        lifetimeRuns: Object.values(settings.usage ?? {}).reduce((n, x) => n + (x.totalRuns ?? 0), 0),
        requests: ai.requests,
        failures: ai.failures,
        promptTokens: ai.promptTokens,
        completionTokens: ai.completionTokens,
        tokens,
        estimatedShare: ai.requests ? ai.estimatedRequests / ai.requests : 0,
        activeDays: ai.activeDays,
        avgTokensPerActiveDay: ai.activeDays ? Math.round(tokens / ai.activeDays) : 0,
        rangeTokens: ai.rangeTokens,
        rangeRequests: ai.rangeRequests,
      },
    };
  });

  const rows: DailyRow[] = range.map((d) => {
    const { users, ...r } = daily.get(d)!;
    return { ...r, activeCustomers: users.size };
  });
  const sum = (f: (r: DailyRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const rangeTokens = sum((r) => r.promptTokens + r.completionTokens);
  const rangeRequests = sum((r) => r.requests);
  const estimated = customers.reduce((n, c) => n + c.ai.estimatedShare * c.ai.requests, 0);
  const allRequests = customers.reduce((n, c) => n + c.ai.requests, 0);

  return {
    generatedAt: new Date().toISOString(),
    days,
    summary: {
      customers: customers.length,
      newCustomers: customers.filter((c) => inRange.has(dayOf(c.createdAt))).length,
      active7d: customers.filter((c) => dayOf(c.lastActive) >= since7).length,
      roles: customers.reduce((n, c) => n + c.roles, 0),
      resumesTailored: customers.reduce((n, c) => n + c.resumesTailored, 0),
      coverLetters: customers.reduce((n, c) => n + c.coverLetters, 0),
      interviewPreps: customers.reduce((n, c) => n + c.interviewPreps, 0),
      rangeRequests,
      rangeTokens,
      avgRequestsPerDay: rangeRequests / days,
      avgTokensPerDay: rangeTokens / days,
      avgTokensPerRequest: rangeRequests ? rangeTokens / rangeRequests : 0,
      estimatedShare: allRequests ? estimated / allRequests : 0,
    },
    daily: rows,
    customers: customers.sort((a, b) => b.lastActive.localeCompare(a.lastActive)),
  };
}

export function mountAdmin(app: Express) {
  app.get('/api/admin/overview', requireAdmin, async (req, res) => {
    try {
      const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
      // other server instances may have saved since this one loaded: re-read everyone's files first
      await storage.refresh('users.json');
      await storage.refreshPrefix('users/');
      res.json(overview(days));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
