import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cookie value that marks a logged-in session. Override with AUTH_TOKEN in prod.
const TOKEN = process.env.AUTH_TOKEN ?? 'rangrooh-stock-authed-9c4458';

/** Gate the whole app behind login. Unauthenticated → /login (pages) or 401 (API). */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes (login screen + its API). /api/backup guards itself with
  // CRON_SECRET / the auth cookie so Vercel Cron can reach it.
  if (pathname === '/login' || pathname === '/api/login' || pathname === '/api/logout' || pathname === '/api/backup') {
    return NextResponse.next();
  }

  const authed = req.cookies.get('auth')?.value === TOKEN;
  if (authed) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and public assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|rangrooh-logo.png|uploads/).*)'],
};
