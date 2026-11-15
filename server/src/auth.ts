import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Express, NextFunction, Request, Response } from 'express';
import * as storage from './storage.ts';
import * as store from './store.ts';
import * as providers from './llm/providers.ts';
import { runAs, userKey, type UserCtx } from './context.ts';
import type { DB } from './types.ts';
import { codeEmail } from './emails.ts';

/**
 * Passwordless sign-in: the user enters their email, gets a 6-digit code by email, and enters it.
 *
 * Nothing about logins is stored on the server. The pending code lives in a signed, httpOnly cookie (only a
 * hash of the code is in it) and the session is another signed cookie. That keeps working when Vercel runs
 * several copies of the server, and costs no storage writes. Guessing is limited by a short expiry, a cap on
 * attempts per code, and caps on how often codes can be requested.
 */

const CODE_TTL_MS = 10 * 60_000;
/** The one-click link in the email is shorter-lived than the code: it signs in without typing anything. */
const LINK_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const MAX_ATTEMPTS = 5;
const PENDING_COOKIE = 'jh_pending';
const SESSION_COOKIE = 'jh_session';

// ---------------------------------------------------------------- secret

function loadSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.VERCEL) return ''; // must be configured; checked on use
  // local: generate once and keep it next to the data
  const f = path.join(storage.DATA_DIR, '.auth-secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(storage.DATA_DIR, { recursive: true });
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

const hmac = (data: string) => {
  if (!SECRET) throw new Error('Sign-in is not configured on this server (AUTH_SECRET is missing)');
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
};

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

function unsign<T>(token: string | undefined): T | undefined {
  if (!token) return;
  const [body, sig] = token.split('.');
  if (!body || !sig) return;
  const want = Buffer.from(hmac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
  } catch {
    return;
  }
}

// ---------------------------------------------------------------- cookies

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
}

function setCookie(req: Request, res: Response, name: string, value: string, maxAgeMs: number) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https' || !!process.env.VERCEL;
  res.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`,
  );
}

const clearCookie = (req: Request, res: Response, name: string) => setCookie(req, res, name, '', 0);

// ---------------------------------------------------------------- users

interface User {
  id: string;
  email: string;
  createdAt: string;
}

const USERS = 'users.json';
const users = (): User[] => JSON.parse(storage.readText(USERS) ?? '[]');
const findUser = (email: string) => users().find((u) => u.email === email);

/**
 * Adds an account. Reads the latest users list from Blob and saves right away (only if nobody else saved in
 * between), so a server instance holding an older copy can never drop other accounts.
 */
async function createUser(email: string): Promise<User> {
  let u: User | undefined;
  await storage.update(USERS, (raw) => {
    const list: User[] = JSON.parse(raw ?? '[]');
    u = list.find((x) => x.email === email) ?? { id: nanoid(12).replace(/[^\w-]/g, ''), email, createdAt: new Date().toISOString() };
    return JSON.stringify(list.includes(u) ? list : [...list, u], null, 2);
  });
  return u!;
}

/** Finds an account, re-reading the users list from Blob if this instance doesn't know it yet. */
async function findUserFresh(email: string) {
  return findUser(email) ?? ((await storage.refresh(USERS)) ? findUser(email) : undefined);
}

export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---------------------------------------------------------------- data from before accounts

/** Files from when the app had no accounts. They belong to whoever's email is in that old profile. */
function legacyKeys(): string[] {
  return [
    ...['db.json', 'settings.json'].filter((k) => storage.exists(k)),
    ...storage.listFiles('resumes/').map((f) => f.key),
  ];
}

function legacyOwner(): string {
  if (process.env.OWNER_EMAIL) return normEmail(process.env.OWNER_EMAIL);
  const raw = storage.readText('db.json');
  return raw ? normEmail((JSON.parse(raw) as DB).profile?.email) : '';
}

const ownsLegacyData = (email: string) => !!email && legacyKeys().length > 0 && legacyOwner() === email;

/** Moves the pre-accounts data into this user's account. */
function claimLegacyData(u: User) {
  const keys = legacyKeys();
  for (const k of keys) storage.rename(k, userKey(k, u.id));
  store.forget(u.id);
  providers.forget(u.id);
  console.log(`[auth] moved ${keys.length} existing files into the account for ${u.email}`);
}

/**
 * Gives the pre-accounts data to a chosen email (used by `npm run claim-data`), creating the account if needed.
 * Refuses if that account already has its own data, so nothing is overwritten.
 */
export async function attachExistingData(rawEmail: string) {
  const email = normEmail(rawEmail);
  if (!validEmail(email)) throw new Error(`Not a valid email: ${rawEmail}`);
  const keys = legacyKeys();
  if (!keys.length) throw new Error('There is no unclaimed data to attach');
  const user = (await findUserFresh(email)) ?? (await createUser(email));
  const clash = keys.filter((k) => storage.exists(userKey(k, user.id)));
  if (clash.length) throw new Error(`${email} already has its own ${clash.join(', ')}; not overwriting`);
  claimLegacyData(user);
  return { user, files: keys.length };
}

// ---------------------------------------------------------------- email

/**
 * Address used for links in emails. Never taken from the request (a forged Origin would put someone else's link
 * in a real email). APP_URL if set; on Vercel, the address of the deployment that sent the email (production
 * domain in production, the branch address on previews); locally, the dev server.
 */
function appUrl(): string | undefined {
  const e = process.env;
  if (e.APP_URL) return e.APP_URL.replace(/\/+$/, '');
  if (!e.VERCEL) return 'http://localhost:5173';
  const host = e.VERCEL_ENV === 'production' ? e.VERCEL_PROJECT_PRODUCTION_URL : e.VERCEL_BRANCH_URL || e.VERCEL_URL;
  if (host) return `https://${host}`;
}

async function sendCode(email: string, code: string, purpose: 'login' | 'signup', linkToken: string) {
  const base = appUrl();
  const link = base ? `${base}/auth/link?t=${encodeURIComponent(linkToken)}` : undefined;
  const { subject, text, html } = codeEmail({ code, purpose, to: email, appUrl: base, link });

  // 1) SMTP (e.g. Brevo's relay) when a password is configured
  if (process.env.SMTP_PASS) return sendSmtp(email, subject, text, html);

  // 2) Resend
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.VERCEL) throw new Error('Email sending is not configured on this server');
    // local development without an email service: show the code in the server log
    console.log(`\n  [auth] ${purpose} code for ${email}: ${code}${link ? `\n  [auth] link: ${link}` : ''}  (set SMTP_PASS to send real emails)\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Job Hunt <onboarding@resend.dev>', to: [email], subject, text, html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[auth] Resend error', res.status, body.slice(0, 300));
    throw new Error(
      res.status === 403 && /domain|testing/i.test(body)
        ? 'We couldn’t email that address yet: the app’s email sender is still in test mode. Ask the app owner to verify a sending domain in Resend.'
        : 'We couldn’t send the email. Try again in a minute.',
    );
  }
}

/**
 * SMTP settings (defaults are Brevo's relay):
 *   SMTP_HOST (smtp-relay.brevo.com), SMTP_PORT (587, STARTTLS), SMTP_USER (login), SMTP_PASS (SMTP key),
 *   EMAIL_FROM: a sender address verified in the SMTP provider, e.g. "Job Hunt <you@yourdomain.com>".
 */
function smtpTransport(): Transporter {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port,
    secure: port === 465, // 587 upgrades to TLS with STARTTLS
    requireTLS: port !== 465,
    auth: {
      user: process.env.SMTP_USER,
      // Gmail shows App Passwords as "abcd efgh ijkl mnop"; the spaces aren't part of it
      pass: /gmail\.com$/i.test(process.env.SMTP_HOST ?? '') ? process.env.SMTP_PASS?.replace(/\s+/g, '') : process.env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

let smtp: Transporter | undefined;
async function sendSmtp(to: string, subject: string, text: string, html: string) {
  const from = process.env.EMAIL_FROM;
  if (!from || !process.env.SMTP_USER) throw new Error('Email sending is not fully configured (SMTP_USER and EMAIL_FROM are required)');
  smtp ??= smtpTransport();
  try {
    await smtp.sendMail({ from, to, subject, text, html });
  } catch (e: any) {
    console.error('[auth] SMTP error:', e.code ?? '', e.responseCode ?? '', String(e.response ?? e.message).slice(0, 300));
    throw new Error(
      e.responseCode === 535 || e.code === 'EAUTH'
        ? 'Email sending isn’t working: the app’s SMTP login was rejected. Ask the app owner to check the SMTP settings.'
        : 'We couldn’t send the email. Try again in a minute.',
    );
  }
}

/** Checks the SMTP login, and optionally sends a test email (used by `npm run smtp:check`). */
export async function checkSmtp(testTo?: string) {
  if (!process.env.SMTP_PASS) throw new Error('SMTP_PASS is not set');
  await smtpTransport().verify();
  if (testTo) await sendSmtp(testTo, 'Job Hunt test email', 'If you can read this, sign-in emails will work.', '<p>If you can read this, sign-in emails will work.</p>');
}

// ---------------------------------------------------------------- rate limits (per server instance)

const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const t = Date.now();
  const list = (hits.get(key) ?? []).filter((x) => x > t - windowMs);
  list.push(t);
  hits.set(key, list);
  return list.length > max;
}

const attempts = new Map<string, { n: number; exp: number; used?: boolean }>();
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of attempts) if (v.exp < t) attempts.delete(k);
  for (const [k, v] of hits) if (!v.some((x) => x > t - 60 * 60_000)) hits.delete(k);
}, 60_000).unref();

// ---------------------------------------------------------------- sessions

interface Session {
  uid: string;
  email: string;
  exp: number;
}

/** The one-click sign-in link in the email: the same sign-in as the code, usable from any browser. */
interface LinkToken {
  k: 'link';
  email: string;
  mode: 'login' | 'signup';
  nonce: string;
  exp: number;
  profile?: SignupProfile;
}

interface Pending {
  email: string;
  mode: 'login' | 'signup';
  nonce: string;
  hash: string;
  exp: number;
  profile?: SignupProfile;
}

/** What the sign-up form collects (all optional apart from the email). */
type SignupProfile = Partial<Record<'name' | 'phone' | 'location' | 'headline' | 'linkedinUrl' | 'targetRoles', string>>;
const PROFILE_FIELDS = ['name', 'phone', 'location', 'headline', 'linkedinUrl', 'targetRoles'] as const;

function cleanProfile(input: any): SignupProfile {
  const out: SignupProfile = {};
  for (const k of PROFILE_FIELDS) {
    const v = String(input?.[k] ?? '').trim().slice(0, k === 'targetRoles' ? 300 : 200);
    if (v) out[k] = v;
  }
  if (out.linkedinUrl && !/^https?:\/\/([\w-]+\.)?linkedin\.com\//i.test(out.linkedinUrl)) {
    if (/^([\w-]+\.)?linkedin\.com\//i.test(out.linkedinUrl)) out.linkedinUrl = `https://${out.linkedinUrl}`;
    else throw new Error('That doesn’t look like a LinkedIn profile link (it should start with linkedin.com/in/…)');
  }
  return out;
}

const hasUser = (id: string) => users().some((u) => u.id === id);

export async function sessionUser(req: Request): Promise<UserCtx | undefined> {
  const s = unsign<Session>(readCookie(req, SESSION_COOKIE));
  if (!s || typeof s.uid !== 'string' || s.exp < Date.now()) return;
  // The account must still exist. This instance's copy of the list may predate the account (another instance
  // created it), so look again in Blob before saying no.
  if (!hasUser(s.uid) && !((await storage.refresh(USERS)) && hasUser(s.uid))) return;
  return { userId: s.uid, email: s.email };
}

/** Runs every other API request as the signed-in user, or answers 401. */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const u = await sessionUser(req);
    if (!u) return void res.status(401).json({ error: 'Please sign in', code: 'auth' });
    // pick up changes another server instance saved for this user
    if (await storage.syncUser(u.userId)) {
      store.forget(u.userId);
      providers.forget(u.userId);
    }
    runAs(u, next);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

/** Signs in (creating the account on sign-up) once a code or link has been checked. */
async function completeSignIn(req: Request, res: Response, p: { email: string; profile?: SignupProfile }) {
  let user = await findUserFresh(p.email);
  let isNew = false;
  if (!user) {
    user = await createUser(p.email);
    isNew = true;
    if (ownsLegacyData(p.email)) claimLegacyData(user);
  }
  const u = user;
  if (isNew)
    runAs({ userId: u.id, email: u.email }, () => {
      // fill in what the sign-up form collected, without overwriting a claimed profile
      const cur = store.getProfile();
      const patch: Record<string, string> = { email: cur.email || u.email };
      for (const [k, v] of Object.entries(p.profile ?? {})) if (!(cur as any)[k]) patch[k] = v;
      store.updateProfile(patch);
    });
  clearCookie(req, res, PENDING_COOKIE);
  setCookie(req, res, SESSION_COOKIE, sign({ uid: u.id, email: u.email, exp: Date.now() + SESSION_TTL_MS } satisfies Session), SESSION_TTL_MS);
  res.json({ user: { id: u.id, email: u.email }, isNew });
}

// ---------------------------------------------------------------- routes

export function mountAuth(app: Express) {
  const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });

  /** Step 1 of sign-in or sign-up: email (plus the sign-up details) → a code is emailed. */
  app.post('/api/auth/start', async (req, res) => {
    try {
      const email = normEmail(req.body?.email);
      const mode = req.body?.mode === 'signup' ? 'signup' : 'login';
      if (!validEmail(email)) return fail(res, 400, 'Enter a valid email address');
      const known = !!(await findUserFresh(email));
      const exists = known || ownsLegacyData(email);
      if (mode === 'login' && !exists) return fail(res, 404, 'There’s no account with that email yet. Sign up first.');
      if (mode === 'signup' && known) return fail(res, 409, 'You already have an account with that email. Sign in instead.');
      const profile = mode === 'signup' ? cleanProfile(req.body?.profile) : undefined;

      const ip = req.get('x-forwarded-for')?.split(',')[0].trim() || req.socket.remoteAddress || '';
      if (limited(`email:${email}`, 5, 15 * 60_000) || limited(`ip:${ip}`, 20, 15 * 60_000))
        return fail(res, 429, 'Too many codes requested. Wait a few minutes and try again.');

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const nonce = nanoid(16);
      const exp = Date.now() + CODE_TTL_MS;
      const pending: Pending = { email, mode, nonce, hash: hmac(`${nonce}:${code}`), exp, profile };
      const link: LinkToken = { k: 'link', email, mode, nonce, exp: Date.now() + LINK_TTL_MS, profile };
      await sendCode(email, code, mode, sign(link));
      setCookie(req, res, PENDING_COOKIE, sign(pending), CODE_TTL_MS);
      res.json({ ok: true, email });
    } catch (e: any) {
      fail(res, 400, e.message);
    }
  });

  /** Step 2: the emailed code → signed in (account created on sign-up). */
  app.post('/api/auth/verify', async (req, res) => {
    try {
      const p = unsign<Pending>(readCookie(req, PENDING_COOKIE));
      if (!p || p.exp < Date.now()) return fail(res, 400, 'That code has expired. Request a new one.');
      const a = attempts.get(p.nonce) ?? { n: 0, exp: p.exp };
      if (a.used) return fail(res, 400, 'That code has already been used. Request a new one.');
      if (a.n >= MAX_ATTEMPTS) return fail(res, 429, 'Too many wrong codes. Request a new one.');
      a.n++;
      attempts.set(p.nonce, a);

      const code = String(req.body?.code ?? '').replace(/\D/g, '');
      const want = Buffer.from(p.hash);
      const got = Buffer.from(hmac(`${p.nonce}:${code}`));
      if (code.length !== 6 || !crypto.timingSafeEqual(want, got)) {
        const left = MAX_ATTEMPTS - a.n;
        return fail(res, 400, left > 0 ? `That code isn’t right. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong codes. Request a new one.');
      }
      attempts.set(p.nonce, { n: MAX_ATTEMPTS, exp: p.exp, used: true }); // one use only (shared with the link)
      await completeSignIn(req, res, p);
    } catch (e: any) {
      fail(res, 400, e.message);
    }
  });

  /**
   * The one-click link from the email. The page at /auth/link posts the token here (a plain GET would be
   * "clicked" by email scanners that preview links). Works in any browser; one use, shared with the code.
   */
  app.post('/api/auth/link', async (req, res) => {
    try {
      const t = unsign<LinkToken>(String(req.body?.t ?? ''));
      if (!t || t.k !== 'link') return fail(res, 400, 'That sign-in link isn’t valid. Request a new code.');
      if (t.exp < Date.now())
        return fail(res, 400, 'That sign-in link has expired: links work for 5 minutes. Enter the 6-digit code from the same email instead (it works for 10 minutes), or request a new one.');
      const a = attempts.get(t.nonce);
      if (a?.used) return fail(res, 400, 'That sign-in link has already been used. Request a new one.');
      if (a && a.n >= MAX_ATTEMPTS) return fail(res, 400, 'Too many wrong codes were tried for this sign-in. Request a new one.');
      attempts.set(t.nonce, { n: MAX_ATTEMPTS, exp: Date.now() + CODE_TTL_MS, used: true }); // outlives the code, so it can't be used after the link
      await completeSignIn(req, res, t);
    } catch (e: any) {
      fail(res, 400, e.message);
    }
  });

  /** Public facts for the home page (no sign-in needed). */
  app.get('/api/auth/config', (_req, res) => res.json({ freeModels: !!process.env.OPENROUTER_API_KEY?.trim() }));

  app.get('/api/auth/me', async (req, res) => {
    try {
      const u = await sessionUser(req);
      u ? res.json({ user: { id: u.userId, email: u.email } }) : fail(res, 401, 'Not signed in');
    } catch (e: any) {
      fail(res, 500, e.message);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    // also forget any session-only API keys entered in this tab
    const sid = req.get('x-session-id');
    if (providers.validSessionId(sid)) providers.dropSession(sid);
    clearCookie(req, res, SESSION_COOKIE);
    res.json({ ok: true });
  });
}
