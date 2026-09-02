'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * Calendar date-picker that filters the queue by ship-by date via the `?date=`
 * URL param — kept in the URL (not local state) so the Print queue link can
 * carry the same date and print only that day's orders.
 */
export function ShipDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('date') ?? '';

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value) next.delete('date');
    else next.set('date', value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <input
      type="date"
      value={current}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by ship-by date"
      title="Filter the queue to one ship-by date"
      className="rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
    />
  );
}
