/** Display helpers (Indian locale / rupees). */

export function inr(n?: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function num(n?: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN').format(n);
}

export function dateTime(d?: Date | string | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  // Pin to India time so it's consistent whether rendered on the server (UTC) or client.
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}

export function dateOnly(d?: Date | string | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(date);
}

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'OS', 'FREE'];

/**
 * Sort variants so the same product+colour group together, then by real size
 * order (XS, S, M, L, XL, XXL) instead of alphabetical (which gives L, M, S…).
 * Keys off the SKU: everything before the last "-" is the colour group, the
 * last segment is the size.
 */
export function compareVariant(aSku: string, bSku: string): number {
  const cut = (s: string): [string, string] => {
    const i = s.lastIndexOf('-');
    return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
  };
  const [ap, asz] = cut(aSku);
  const [bp, bsz] = cut(bSku);
  if (ap !== bp) return ap.localeCompare(bp);
  const idx = (x: string) => {
    const i = SIZE_ORDER.indexOf(x.toUpperCase());
    return i < 0 ? 99 : i;
  };
  return idx(asz) - idx(bsz) || asz.localeCompare(bsz);
}

/**
 * Group already-sorted variants by colour (the SKU minus its last/size segment).
 * Returns one entry per product+colour, with a title (the product name without
 * the trailing size word) and its rows in order. Used to render a card per group.
 */
export function groupVariants<T extends { sku: string; name: string }>(
  rows: T[],
  sizeOf: (r: T) => string,
): { key: string; title: string; rows: T[] }[] {
  const out: { key: string; title: string; rows: T[] }[] = [];
  const byKey = new Map<string, { key: string; title: string; rows: T[] }>();
  for (const r of rows) {
    const i = r.sku.lastIndexOf('-');
    const key = i < 0 ? r.sku : r.sku.slice(0, i);
    let g = byKey.get(key);
    if (!g) {
      const sz = (sizeOf(r) || '').toUpperCase();
      const parts = r.name.trim().split(/\s+/);
      const title = parts.length > 1 && parts[parts.length - 1].toUpperCase() === sz ? parts.slice(0, -1).join(' ') : r.name;
      g = { key, title, rows: [] };
      byKey.set(key, g);
      out.push(g);
    }
    g.rows.push(r);
  }
  return out;
}

/**
 * Search match, ignoring case and all punctuation/spaces on BOTH sides. Each
 * typed word must appear (in any order) in the punctuation-free text. So
 * "coordset blue", "coord blue", and "rrc006cofbluxl" all match
 * "RRC-001-CO-A-BLU-L — Co-ord Set Blue-Cross L".
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const squish = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const h = squish(haystack.toLowerCase());
  const terms = q.split(/\s+/).map(squish).filter(Boolean);
  return terms.every((t) => h.includes(t));
}

export function timeAgo(d?: Date | string | null): string {
  if (!d) return 'never';
  const date = typeof d === 'string' ? new Date(d) : d;
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}
