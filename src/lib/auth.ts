import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/db';
import { SessionModel } from '@/models/Session';
import type { Role } from '@/lib/permissions';

export const SESSION_COOKIE = 'auth';
const SESSION_DAYS = 60;

export interface SessionData {
  accountId: string;
  username: string;
  role: Role;
  allowedSections: string[];
}

/** Creates a new session for this account and returns its token (for the cookie). */
export async function createSession(account: {
  id: string;
  username: string;
  role: Role;
  allowedSections: string[];
}): Promise<{ token: string; expiresAt: Date }> {
  await connectDB();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await SessionModel.create({
    _id: token,
    accountId: account.id,
    username: account.username,
    role: account.role,
    allowedSections: account.allowedSections,
    expiresAt,
  });
  return { token, expiresAt };
}

/** Deletes one session (logout). */
export async function destroySession(token: string): Promise<void> {
  await connectDB();
  await SessionModel.deleteOne({ _id: token });
}

/**
 * Deletes every session for an account — forces re-login. Called whenever an
 * account's role, permissions, or password changes, so the change takes
 * effect immediately rather than silently staying stale until the account
 * happens to log out on its own.
 */
export async function destroyAllSessionsForAccount(accountId: string): Promise<void> {
  await connectDB();
  await SessionModel.deleteMany({ accountId });
}

/**
 * Reads the current session from the request cookie — for Server
 * Components/route handlers. Middleware already validated the session
 * before the request reached here (see src/middleware.ts); this is an
 * independent re-check, not a trust of that result, and returns null if not
 * logged in or the session has expired/been revoked.
 */
export async function getCurrentSession(): Promise<SessionData | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await connectDB();
  const doc = await SessionModel.findById(token).lean();
  if (!doc || doc.expiresAt.getTime() < Date.now()) return null;
  return {
    accountId: doc.accountId,
    username: doc.username,
    role: doc.role as Role,
    allowedSections: doc.allowedSections,
  };
}
