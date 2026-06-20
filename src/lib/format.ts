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
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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

export function timeAgo(d?: Date | string | null): string {
  if (!d) return 'never';
  const date = typeof d === 'string' ? new Date(d) : d;
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}
