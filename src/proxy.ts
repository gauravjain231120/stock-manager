import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db';
import { SessionModel } from '@/models/Session';
import { isPathAllowed, sectionsForRole, NO_ACCESS_PATH, type Role } from '@/lib/permissions';

// Public routes (login screen + its API). /api/backup and /api/cron/poll
// guard themselves with CRON_SECRET (or an Owner session, for /api/backup)
// so Vercel Cron can reach them without ever carrying a session cookie —
// otherwise this gate would 401 Cron's bearer-token request before it ever
// reached that route's own check.
const PUBLIC_PATHS = new Set(['/login', '/api/login', '/api/logout', '/api/backup', '/api/cron/poll']);

// The order-alert integration (a SEPARATE app — Myntra/Amazon order events
// adding/removing rows in the Ready-to-Ship queue, and now also its own
// dashboard's "Scan a Myntra return" card writing straight into
// /api/register) is a server calling another server, never a browser — it
// can never carry a real per-account session cookie. It already sends the
// fixed shared secret the old single-login system used, unchanged since
// before this per-account/role system existed; recognizing that same value
// here (already configured in that other app's own env, nothing to change
// there) keeps it working without needing a session, but ONLY for the exact
// API surface it actually calls — everything else still requires a real
// logged-in account.
const SERVICE_TOKEN = process.env.AUTH_TOKEN ?? 'rangrooh-stock-authed-9c4458';
const SERVICE_API_PREFIXES = ['/api/pending', '/api/register'];
// Constant-time (a plain === reveals, char by char, how much of a guess was
// right). Plain JS on purpose — no runtime-specific crypto import in here.
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isServiceRequest(pathname: string, token: string | undefined): boolean {
  return Boolean(token) && sameSecret(String(token), SERVICE_TOKEN) && SERVICE_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Gates the whole app behind login AND per-role/per-section authorization.
 *
 * Renamed from middleware.ts per Next.js 16's own migration (file convention
 * deprecated → proxy.ts) — this wasn't cosmetic: the "defaults to Node.js
 * runtime" guarantee this relies on for a real per-request DB lookup is
 * specifically documented for proxy.ts, not the legacy middleware.ts name,
 * and keeping the old filename produced a live MIDDLEWARE_INVOCATION_FAILED
 * crash on Vercel (consistent with it actually still running on their Edge
 * network under the old name, where mongoose/TCP sockets aren't available).
 *
 * Checked here — not just hidden in the sidebar — so a section a Viewer
 * wasn't granted can't be reached by typing its URL, page or API, directly.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get('auth')?.value;

  if (isServiceRequest(pathname, token)) {
    return NextResponse.next();
  }

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
