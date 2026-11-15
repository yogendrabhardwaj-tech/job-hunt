import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The signed-in user a piece of work belongs to. Set once per API request by the auth middleware and
 * carried automatically through everything that request starts, including agent runs that keep going
 * after the response, so the store and AI-source code always see the right user's data.
 */
export interface UserCtx {
  userId: string;
  email: string;
}

const als = new AsyncLocalStorage<UserCtx>();

export const runAs = <T>(ctx: UserCtx, fn: () => T): T => als.run(ctx, fn);

export function currentUser(): UserCtx {
  const c = als.getStore();
  if (!c) throw new Error('No signed-in user for this operation');
  return c;
}

export const currentUserId = () => currentUser().userId;

/** For code that may run outside a request (e.g. event tagging). */
export const maybeUserId = () => als.getStore()?.userId;

/** Storage key inside the current user's folder, e.g. userKey('db.json') → users/<id>/db.json */
export const userKey = (key: string, userId = currentUserId()) => `users/${userId}/${key}`;
