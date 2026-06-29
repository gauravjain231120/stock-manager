'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PLATFORMS, PLATFORM_LABELS } from '@/lib/constants';

/** Dropdown that filters the queue by platform via the `?platform=` URL param. */
export function PlatformFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('platform') ?? 'all';

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === 'all') next.delete('platform');
    else next.set('platform', value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by platform"
      className="rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
    >
      <option value="all">All platforms</option>
      {PLATFORMS.map((p) => (
        <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
      ))}
    </select>
  );
}
