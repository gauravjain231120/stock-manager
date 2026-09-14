export const ROLES = ['OWNER', 'MANAGER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export interface Section {
  href: string;
  label: string;
}

/** Every grantable sidebar section — what an Owner picks from when setting
 *  up a Manager or Viewer account. Owner gets all of these automatically;
 *  Manager and Viewer only get what's explicitly checked for that account. */
export const SECTIONS: Section[] = [
  { href: '/register', label: 'Stock Log' },
  { href: '/notes', label: 'Notes' },
  { href: '/ship', label: 'Ready to Ship' },
  { href: '/shipped', label: 'Shipped' },
  { href: '/returns', label: 'Returns' },
  { href: '/products', label: 'Products' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/produce', label: 'Produce' },
  { href: '/account', label: 'Expense' },
];
export const SECTION_HREFS = SECTIONS.map((s) => s.href);

/** Owner-only pages — never grantable to Manager or Viewer, always available to Owner. */
export const OWNER_SECTIONS: Section[] = [{ href: '/team', label: 'Team' }];
const OWNER_ONLY_PAGE_PREFIXES = ['/team'];

/** Always reachable once logged in, regardless of role/sections — where an
 *  account with nothing granted yet lands instead of bouncing back to the
 *  login form (confusing, since they ARE logged in) or a raw 403. */
export const NO_ACCESS_PATH = '/no-access';

/** API path prefixes that belong to each grantable section — an account can
 *  only reach an API route if it falls under one of their granted sections'
 *  prefixes. Deliberately fail-closed: anything not listed here is denied
 *  rather than guessed into an allow. /register's API is shared by both
 *  Stock Log and Produce (recording production posts through the same
 *  endpoint the stock log itself uses). */
export const SECTION_API_PREFIXES: Record<string, string[]> = {
  '/register': ['/api/register'],
  '/notes': ['/api/notes'],
  '/ship': ['/api/pending'],
  '/shipped': [],
  '/returns': ['/api/return-reports', '/api/return-shipments', '/api/returns'],
  '/products': ['/api/products', '/api/channel-listings', '/api/upload', '/api/bom'],
  '/inventory': ['/api/stock'],
  '/produce': ['/api/register', '/api/raw-materials', '/api/bom'],
  '/account': ['/api/account'],
};

/** Small shared utility endpoints every authenticated role can use regardless
 *  of section grants — they back pickers/search used across many pages, not
 *  a page of their own. Read-only by nature, so fine for Viewer too. */
const SHARED_API_PREFIXES = ['/api/skus'];

/** Owner-only API surface — never reachable by Manager or Viewer. Note:
 *  '/api/account' (singular, the Expense ledger) is now a grantable section
 *  via SECTION_API_PREFIXES above — only '/api/accounts' (plural, Team
 *  account management: creating/editing logins, passwords, roles) stays
 *  locked to Owner. */
const OWNER_API_PREFIXES = ['/api/accounts'];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The sections this role/allowedSections combination actually gets, in nav order. */
export function sectionsForRole(role: Role, allowedSections: string[]): Section[] {
  if (role === 'OWNER') return [...SECTIONS, ...OWNER_SECTIONS];
  return SECTIONS.filter((s) => allowedSections.includes(s.href));
}

/**
 * True if `method pathname` is allowed for this role/allowedSections — used
 * by middleware for BOTH pages and API routes, so a page an account can't
 * see also can't be reached by calling its API directly.
 *
 * Owner: unrestricted, everything including Account/Team.
 * Manager: read/write, but only within the sections an Owner explicitly
 * granted this account (no longer automatic "all sections").
 * Viewer: same section grants as Manager, but STRICTLY READ-ONLY within
 * them — any non-GET/HEAD request into a granted section's API is refused,
 * enforced here (not just hidden in the UI), so it can't be bypassed by
 * calling the API directly.
 */
export function isPathAllowed(pathname: string, method: string, role: Role, allowedSections: string[]): boolean {
  if (role === 'OWNER') return true;
  if (pathname === NO_ACCESS_PATH) return true;

  if (pathname.startsWith('/api/')) {
    if (matchesPrefix(pathname, SHARED_API_PREFIXES)) return true;
    if (matchesPrefix(pathname, OWNER_API_PREFIXES)) return false;
    const granted = allowedSections.some((section) => matchesPrefix(pathname, SECTION_API_PREFIXES[section] || []));
    if (!granted) return false;
    if (role === 'VIEWER' && !SAFE_METHODS.has(method.toUpperCase())) return false;
    return true;
  }

  if (matchesPrefix(pathname, OWNER_ONLY_PAGE_PREFIXES)) return false;
  // Viewing a page is always a GET — the read-only restriction only bites on
  // the API calls a page's buttons/forms make, not on looking at the page.
  return allowedSections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
}
