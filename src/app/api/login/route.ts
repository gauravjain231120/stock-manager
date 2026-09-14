import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { AccountModel } from '@/models/Account';
import { verifyPassword } from '@/lib/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth';
import { sectionsForRole, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

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
  if (!account || !(await verifyPassword(password, account.passwordHash, account.passwordSalt))) {
    return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
  }

  const role = account.role as Role;
  const { token, expiresAt } = await createSession({
    id: String(account._id),
    username: account.username,
    role,
    allowedSections: account.allowedSections,
  });

  // Land on the first section this account can actually see — a Viewer
  // without Stock Log granted shouldn't bounce off a blocked default page.
  const redirectTo = sectionsForRole(role, account.allowedSections)[0]?.href ?? '/login';

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
