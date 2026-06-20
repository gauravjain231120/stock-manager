import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** POST /api/logout — clear the auth cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('auth', '', { maxAge: 0, path: '/' });
  return res;
}
