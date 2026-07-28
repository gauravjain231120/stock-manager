'use client';

import { useState } from 'react';
import { Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui';
import { dateOnly, matchesSearch } from '@/lib/format';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';
import type { MovementRow } from '@/lib/movements';
import type { ReportView } from '@/lib/returnReports';

const MAX_SHOWN = 25;

function platformLabel(c: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

/**
 * One box to answer "where is this parcel?" — searches both the returns that
 * were actually logged and the tracking numbers on platform reports, so an
 * unmatched number is obvious straight away.
 */
export function ReturnSearch({ rows, reports }: { rows: MovementRow[]; reports: ReportView[] }) {
  const [q, setQ] = useState('');
  const term = q.trim();

  const foundReturns = term
    ? rows.filter((r) => matchesSearch(`${r.sku} ${r.name} ${r.color} ${r.size} ${r.trackingId ?? ''} ${r.orderId ?? ''} ${platformLabel(r.channel)}`, term, r.sku))
    : [];

  const foundLines = term
    ? reports.flatMap((rep) =>
        rep.lines
          .filter((l) => matchesSearch(`${l.trackingId} ${l.name ?? ''} ${l.sku ?? ''}`, term, l.trackingId))
          .map((l) => ({ rep, line: l })),
      )
    : [];

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5"><Search size={14} /> Find a return or a report line</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Scan or type a tracking number, product, SKU or order number…"
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
        />
      </label>

      {term ? (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <div className="mb-2 text-xs font-medium text-neutral-500">
              Logged returns ({foundReturns.length})
            </div>
            {foundReturns.length === 0 ? (
              <p className="text-sm text-neutral-400">No return recorded for this.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {foundReturns.slice(0, MAX_SHOWN).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span className="font-medium">{r.qty} × {r.name}{r.color ? ` — ${r.color}` : ''}{r.size ? ` · ${r.size}` : ''}</span>
                    <span className="font-mono text-xs text-neutral-500">{r.trackingId ?? 'no tracking'}</span>
                    <span className="text-xs text-neutral-400">{platformLabel(r.channel)} · returned {dateOnly(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-neutral-500">
              On platform reports ({foundLines.length})
            </div>
            {foundLines.length === 0 ? (
              <p className="text-sm text-neutral-400">Not on any saved report.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {foundLines.slice(0, MAX_SHOWN).map(({ rep, line }) => (
                  <li
                    key={`${rep.id}-${line.trackingId}`}
                    className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      line.received ? 'bg-emerald-500/10' : line.settled ? 'bg-black/5 dark:bg-white/5' : 'bg-red-500/10'
                    }`}
                  >
                    {line.received ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertTriangle size={15} className={line.settled ? 'text-neutral-400' : 'text-red-600'} />}
                    <span className="font-mono text-xs">{line.trackingId}</span>
                    <span className="text-xs text-neutral-400">{platformLabel(rep.platform)} report · {dateOnly(rep.reportDate)}</span>
                    {line.received ? (
                      <Badge tone="good">received</Badge>
                    ) : line.settled ? (
                      <Badge>claimed</Badge>
                    ) : (
                      <Badge tone="danger">not received</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
