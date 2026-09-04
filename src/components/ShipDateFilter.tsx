'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * Builds up a SET of ship-by dates (not just one) via repeated picks — kept
 * in the URL as `?dates=YYYY-MM-DD,YYYY-MM-DD` (like the platform filter) so
 * the Print queue link carries the same set and prints all of them together.
 */
export function ShipDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get('dates') ?? '').split(',').filter(Boolean);

  function setDates(next: string[]) {
    const nextParams = new URLSearchParams(params.toString());
    if (next.length === 0) nextParams.delete('dates');
    else nextParams.set('dates', next.join(','));
    const qs = nextParams.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function addDate(value: string) {
    if (!value || current.includes(value)) return;
    setDates([...current, value].sort());
  }

  function removeDate(value: string) {
    setDates(current.filter((d) => d !== value));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="date"
        value=""
        onChange={(e) => addDate(e.target.value)}
        aria-label="Add a ship-by date to the filter"
        title="Pick a date to add — you can add several"
        className="rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
      />
      {current.map((d) => (
        <span
          key={d}
          className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-white/10 dark:text-neutral-100"
        >
          {d}
          <button
            type="button"
            onClick={() => removeDate(d)}
            aria-label={`Remove ${d} from filter`}
            className="leading-none text-brand-500 hover:text-brand-700 dark:text-neutral-400 dark:hover:text-white"
          >
            ×
          </button>
        </span>
      ))}
      {current.length > 1 ? (
        <button
          type="button"
          onClick={() => setDates([])}
          className="text-xs font-medium text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
