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

export function timeAgo(d?: Date | string | null): string {
  if (!d) return 'never';
  const date = typeof d === 'string' ? new Date(d) : d;
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}
