import { cookies } from 'next/headers';
import { getUserById } from '@/lib/store';
import { SESSION_COOKIE, readSessionToken } from './session';
import type { User, AuthContext } from '@/lib/types';

export * from './session';

/**
 * The signed-in user, or null. Server components and route handlers only.
 *
 * Middleware already rejects unauthenticated requests, but this re-reads and
 * re-verifies rather than trusting a header the edge set — a valid signature
 * still needs to map to a real, active user (they may have been disabled or
 * deleted since the cookie was issued).
 */
export async function currentUser(): Promise<User | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const userId = await readSessionToken(token);
  if (!userId) return null;

  const user = await getUserById(userId);
  if (!user || user.status !== 'active') return null;
  return user;
}

/** For route handlers that must have a user. Throws if absent. */
export async function requireUser(): Promise<AuthContext & { user: User }> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return { userId: user.id, orgId: user.orgId, user };
}

export class UnauthorizedError extends Error {
  constructor() { super('not signed in'); this.name = 'UnauthorizedError'; }
}
