import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { AccountModel } from '@/models/Account';
import { verifyPassword } from '@/lib/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth';
import { sectionsForRole, NO_ACCESS_PATH, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// A login attempt against a username that doesn't exist must still pay the
// same scrypt cost as a real one — otherwise response timing leaks which
// usernames exist (verifyPassword, and its ~expensive hash, would otherwise
// be skipped entirely whenever `account` is null). These never match a real
// password; they only exist to keep the timing constant.
const DUMMY_SALT = 'a'.repeat(32);
const DUMMY_HASH = 'b'.repeat(128);

/** POST /api/login — check credentials against the Accounts collection, start a session. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { username?: string; password?: string }));
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password) {
    return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
  }

  await connectDB();
  const account = await AccountModel.findOne({ username });
  const valid = account
    ? await verifyPassword(password, account.passwordHash, account.passwordSalt)
    : await verifyPassword(password, DUMMY_HASH, DUMMY_SALT);
  if (!account || !valid) {
    return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
  }

  const role = account.role as Role;
  const { token, expiresAt } = await createSession({
    id: String(account._id),
    username: account.username,
    role,
    allowedSections: account.allowedSections,
  });

  // Land on the first section this account can actually see. Falling back to
  // '/login' here (instead of NO_ACCESS_PATH) sent a just-logged-in account
  // with zero granted sections straight back to the login page — the client
  // would router.replace('/login') while already authenticated, so the form
  // just sat stuck on "Logging in…" instead of showing anything useful.
  const redirectTo = sectionsForRole(role, account.allowedSections)[0]?.href ?? NO_ACCESS_PATH;

  const res = NextResponse.json({ ok: true, redirectTo });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
  return res;
}
