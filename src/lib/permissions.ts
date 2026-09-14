export const ROLES = ['OWNER', 'MANAGER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export interface Section {
  href: string;
  label: string;
}

/** Every grantable sidebar section — what a Viewer's allowedSections picks
 *  from, and what Manager/Owner get in full automatically. */
export const SECTIONS: Section[] = [
  { href: '/register', label: 'Stock Log' },
  { href: '/notes', label: 'Notes' },
  { href: '/ship', label: 'Ready to Ship' },
  { href: '/shipped', label: 'Shipped' },
  { href: '/returns', label: 'Returns' },
  { href: '/products', label: 'Products' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/produce', label: 'Produce' },
];
export const SECTION_HREFS = SECTIONS.map((s) => s.href);

/** Owner-only pages — never grantable to a Viewer, always available to Owner. */
export const OWNER_SECTIONS: Section[] = [
  { href: '/account', label: 'Account' },
  { href: '/team', label: 'Team' },
];
const OWNER_ONLY_PAGE_PREFIXES = ['/account', '/team'];

/** API path prefixes that belong to each grantable section — a Viewer can
 *  only reach an API route if it falls under one of their granted sections'
 *  prefixes. Deliberately fail-closed: anything not listed here is denied to
 *  Viewer rather than guessed into an allow. /register's API is shared by
 *  both Stock Log and Produce (recording production posts through the same
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
};

/** Small shared utility endpoints every authenticated role can use regardless
 *  of section grants — they back pickers/search used across many pages, not
 *  a page of their own. */
const SHARED_API_PREFIXES = ['/api/skus'];

/** Owner-only API surface — never reachable by Manager or Viewer. */
const OWNER_API_PREFIXES = ['/api/account', '/api/accounts'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The sections this role/allowedSections combination actually gets, in nav order. */
export function sectionsForRole(role: Role, allowedSections: string[]): Section[] {
  if (role === 'OWNER') return [...SECTIONS, ...OWNER_SECTIONS];
  if (role === 'MANAGER') return SECTIONS;
  return SECTIONS.filter((s) => allowedSections.includes(s.href));
}

/**
 * True if `pathname` is allowed for this role — used by middleware for BOTH
 * pages and API routes, so a page a Viewer can't see also can't be reached
 * by calling its API directly. Owner: unrestricted. Manager: everything
 * except the owner-only surface (Account/Team, matches today's full access
 * otherwise — including pages with no sidebar link, same as before this
 * feature existed). Viewer: only what's under a granted section.
 */
export function isPathAllowed(pathname: string, role: Role, allowedSections: string[]): boolean {
  if (role === 'OWNER') return true;

  if (pathname.startsWith('/api/')) {
    if (matchesPrefix(pathname, SHARED_API_PREFIXES)) return true;
    if (matchesPrefix(pathname, OWNER_API_PREFIXES)) return false;
    if (role === 'MANAGER') return true;
    return allowedSections.some((section) => matchesPrefix(pathname, SECTION_API_PREFIXES[section] || []));
  }

  if (matchesPrefix(pathname, OWNER_ONLY_PAGE_PREFIXES)) return false;
  if (role === 'MANAGER') return true;
  return allowedSections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
}
