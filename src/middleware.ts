import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { SessionModel } from '@/models/Session';
import { isPathAllowed, sectionsForRole, NO_ACCESS_PATH, type Role } from '@/lib/permissions';

// Public routes (login screen + its API). /api/backup guards itself with
// CRON_SECRET / the auth cookie so Vercel Cron can reach it.
const PUBLIC_PATHS = new Set(['/login', '/api/login', '/api/logout', '/api/backup']);

/**
 * Gates the whole app behind login AND per-role/per-section authorization.
 * Runs on Node.js (this Next.js version's middleware/proxy defaults to it,
 * not Edge — see AGENTS.md), so a real DB lookup per request is fine, same
 * as any route handler. Checked here — not just hidden in the sidebar — so
 * a section a Viewer wasn't granted can't be reached by typing its URL, page
 * or API, directly.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get('auth')?.value;
  let session: { role: Role; allowedSections: string[] } | null = null;
  if (token) {
    try {
      await connectDB();
      const doc = await SessionModel.findById(token).lean();
      if (doc && doc.expiresAt.getTime() > Date.now()) {
        session = { role: doc.role as Role, allowedSections: doc.allowedSections };
      }
    } catch {
      // Fail closed — never treat an unreachable DB as "authorized".
      session = null;
    }
  }

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (isPathAllowed(pathname, req.method, session.role, session.allowedSections)) {
    return NextResponse.next();
  }

  // Logged in, but this specific page/API isn't part of this account's role
  // or granted sections — or (Viewer) it's a granted section's page, just
  // not a mutating request into it.
  if (pathname.startsWith('/api/')) {
    const readOnly = session.role === 'VIEWER';
    return NextResponse.json(
      { error: readOnly ? 'View-only access — your account can look but not make changes here.' : 'Forbidden' },
      { status: 403 },
    );
  }
  const fallback = sectionsForRole(session.role, session.allowedSections)[0]?.href ?? NO_ACCESS_PATH;
  const url = req.nextUrl.clone();
  url.pathname = fallback;
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and public assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|rangrooh-logo.png|uploads/).*)'],
};
