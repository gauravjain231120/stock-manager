'use client';

import { useState } from 'react';
import { Panel } from '@/components/ui';
import { dayKey, num } from '@/lib/format';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';
import type { MovementRow } from '@/lib/movements';

const inputCls = 'rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white';
const btnCls = 'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10';

function platformLabel(c: string | null) {
  if (!c) return 'No platform';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

/** Shift a YYYY-MM-DD string by whole days without tripping over timezones. */
function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/**
 * "What happened on this day" — pick a date, see the platform-wise counts.
 * `today` comes from the server already pinned to India time, so the default
 * matches whatever the rest of the page shows.
 */
export function MovementDayPanel({
  rows,
  today,
  title,
  verb,
}: {
  rows: MovementRow[];
  today: string;
  title: string;
  /** Past-tense word for the empty state, e.g. "shipped" or "returned". */
  verb: string;
}) {
  const [day, setDay] = useState(today);

  // A parcel cancelled before it left (Shipped page) never went out — not counted.
  const dayRows = day ? rows.filter((r) => !r.cancelled && dayKey(r.at) === day) : [];
  const units = dayRows.reduce((a, r) => a + r.qty, 0);
  // A row with no order number can't be grouped with anything else, so it
  // counts as its own order — same convention as the Ready-to-Ship queue.
  const orderCount = new Set(dayRows.map((r) => r.orderId || `row:${r.id}`)).size;

  const byPlatform = new Map<string, { units: number; orders: Set<string> }>();
  for (const r of dayRows) {
    const key = r.channel ?? '';
    const e = byPlatform.get(key) ?? { units: 0, orders: new Set<string>() };
    e.units += r.qty;
    e.orders.add(r.orderId || `row:${r.id}`);
    byPlatform.set(key, e);
  }
  const platforms = [...byPlatform.entries()]
    .map(([channel, e]) => [channel, { units: e.units, count: e.orders.size }] as const)
    .sort((a, b) => b[1].units - a[1].units);

  return (
    <Panel
      title={title}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={() => setDay(shiftDay(day, -1))} disabled={!day} className={btnCls} aria-label="Previous day">‹</button>
          <input
            type="date"
            value={day}
            max={today || undefined}
            onChange={(e) => setDay(e.target.value)}
            aria-label="Pick a date"
            className={inputCls}
          />
          <button onClick={() => setDay(shiftDay(day, 1))} disabled={!day || day >= today} className={btnCls} aria-label="Next day">›</button>
          <button onClick={() => setDay(today)} disabled={!today || day === today} className={btnCls}>Today</button>
        </div>
      }
    >
      <div className="px-5 py-4">
        {dayRows.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Nothing {verb} on {day}{day === today ? ' yet' : ''}.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{num(units)}</span>
              <span className="text-sm text-neutral-500">
                unit{units === 1 ? '' : 's'} in {orderCount} order{orderCount === 1 ? '' : 's'}
                {day === today ? ' today' : ` on ${day}`}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {platforms.map(([channel, s]) => (
                <div key={channel || 'none'} className="rounded-lg border border-black/10 px-4 py-3 dark:border-white/10">
                  <div className="text-sm text-neutral-500">{platformLabel(channel || null)}</div>
                  <div className="mt-0.5 text-2xl font-semibold tabular-nums">{num(s.units)}</div>
                  <div className="text-xs text-neutral-400">{s.count} order{s.count === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
