import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const USER = process.env.AUTH_USERNAME ?? 'rangrooh';
const PASS = process.env.AUTH_PASSWORD ?? 'rangrooh@123';
const TOKEN = process.env.AUTH_TOKEN ?? 'rangrooh-stock-authed-9c4458';

/** POST /api/login — check credentials, set a long-lived auth cookie (60 days). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { username?: string; password?: string }));
  if (body?.username === USER && body?.password === PASS) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set('auth', TOKEN, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 60, // 60 days — stay logged in
      path: '/',
    });
    return res;
  }
  return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
}
