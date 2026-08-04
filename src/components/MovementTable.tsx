'use client';

import { useState } from 'react';
import { Panel, Table, Th, Td, Tr } from '@/components/ui';
import { dateOnly, dayKey, matchesSearch, num } from '@/lib/format';
import { PLATFORMS, PLATFORM_LABELS, Platform, RETURN_CONDITION_LABELS, ReturnCondition } from '@/lib/constants';
import { EditMovementButton } from '@/components/EditMovementButton';
import { ExportCsvButton } from '@/components/ExportCsvButton';
import { toCsv, text, csvDateStamp, csvDateTime } from '@/lib/csv';
import type { MovementRow } from '@/lib/movements';

const filterCls = 'rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white';
const pagerBtnCls =
  'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10';
const PER_PAGE_OPTIONS = [20, 50, 80, 100, 200, 300];

function platformLabel(c: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

/** "1 Feb 2026 – 4 Aug 2026" — whichever ends of the range were actually picked. */
function rangeLabel(from: string, to: string): string {
  if (from && to) return `${dateOnly(from)} – ${dateOnly(to)}`;
  if (from) return `from ${dateOnly(from)}`;
  if (to) return `up to ${dateOnly(to)}`;
  return 'all time';
}

/**
 * The full history of one kind of movement (shipments or returns) — searchable,
 * filterable by category, platform and date range, and paged. The bar above the
 * table always totals whatever the filters currently leave in view, so picking
 * a category and a date range answers "how many went out in that window".
 *
 * `title` names the list, `dateLabel` names the first column ("Shipped"/"Returned").
 * `verb` is that word in prose, e.g. "shipped". `csvName` prefixes the export
 * filename; `withCondition` adds the two returns-only columns. Pass `returnRows`
 * to have the same bar also count what came back.
 */
export function MovementTable({
  rows,
  title,
  dateLabel,
  verb,
  csvName,
  withCondition = false,
  returnRows,
}: {
  rows: MovementRow[];
  title: string;
  dateLabel: string;
  verb: string;
  csvName: string;
  withCondition?: boolean;
  /** The returns ledger, run through these same filters — shown alongside the total. */
  returnRows?: MovementRow[];
}) {
  const [q, setQ] = useState('');
  const [fCategory, setFCategory] = useState('all');
  const [fPlatform, setFPlatform] = useState('all');
  const [onlyUntracked, setOnlyUntracked] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();

  function matches(r: MovementRow) {
    // "" is a real choice here — the products that have no category at all.
    if (fCategory !== 'all' && r.category !== fCategory) return false;
    if (fPlatform !== 'all' && r.channel !== fPlatform) return false;
    if (onlyUntracked && r.trackingId) return false;
    // Compare India-time calendar days, so a date means the day you'd see on screen.
    if (fromDate || toDate) {
      const day = dayKey(r.at);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
    }
    if (!q.trim()) return true;
    const hay = `${r.sku} ${r.name} ${r.category} ${r.color} ${r.size} ${r.trackingId ?? ''} ${r.orderId ?? ''} ${platformLabel(r.channel)}`;
    return matchesSearch(hay, q, r.sku);
  }

  const filtered = rows.filter(matches);

  function buildCsv() {
    const headers = ['Date', 'Time', 'SKU', 'Product', 'Colour', 'Size', 'Qty', 'Platform', 'Tracking / AWB', 'Order no.'];
    if (withCondition) headers.push('Condition', 'Back in stock');

    return toCsv(
      headers,
      filtered.map((r) => {
        const { date, time } = csvDateTime(r.at);
        const row: unknown[] = [
          date,
          time,
          // Only tracking and order numbers need the Excel-safe wrapper — SKUs
          // all start with a letter, so Excel already leaves them alone.
          r.sku,
          r.name,
          r.color,
          r.size,
          r.qty,
          platformLabel(r.channel),
          text(r.trackingId),
          text(r.orderId),
        ];
        if (withCondition) {
          row.push(
            r.condition ? RETURN_CONDITION_LABELS[r.condition as ReturnCondition] ?? r.condition : '',
            // Only a wrong item is held back; good and used both go on the shelf.
            r.condition === 'WRONG' ? 'No' : 'Yes',
          );
        }
        return row;
      }),
    );
  }

  // Everything the filters left in view — the number you came for when you
  // picked a category and a date range.
  const units = filtered.reduce((a, r) => a + r.qty, 0);

  // The same slice of the returns ledger: returns *logged* in this window, not
  // necessarily returns of these exact shipments — near enough to read as a rate.
  const returnsInView = returnRows?.filter(matches) ?? [];
  const returnedUnits = returnsInView.reduce((a, r) => a + r.qty, 0);
  const returnRate = units > 0 ? Math.round((returnedUnits / units) * 1000) / 10 : 0;

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const cur = Math.min(page, pageCount);
  const pageRows = filtered.slice((cur - 1) * perPage, cur * perPage);
  const from = filtered.length === 0 ? 0 : (cur - 1) * perPage + 1;
  const to = Math.min(cur * perPage, filtered.length);

  return (
    <Panel
      title={`${title} (${filtered.length})`}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            value={fCategory}
            onChange={(e) => { setFCategory(e.target.value); setPage(1); }}
            aria-label="Filter by category"
            className={filterCls}
          >
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            {rows.some((r) => !r.category) ? <option value="">No category</option> : null}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-neutral-500">
            From
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className={filterCls} />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-neutral-500">
            To
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className={filterCls} />
          </label>
          {fromDate || toDate ? (
            <button onClick={() => { setFromDate(''); setToDate(''); setPage(1); }} className={pagerBtnCls}>Clear dates</button>
          ) : null}
          <label className="flex items-center gap-1.5 text-sm text-neutral-500">
            <input
              type="checkbox"
              checked={onlyUntracked}
              onChange={(e) => { setOnlyUntracked(e.target.checked); setPage(1); }}
              className="size-4 accent-brand-600"
            />
            No tracking
          </label>
          <select value={fPlatform} onChange={(e) => { setFPlatform(e.target.value); setPage(1); }} aria-label="Filter by platform" className={filterCls}>
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
          </select>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search tracking, product, SKU or order…"
            className="w-48 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20 sm:w-72"
          />
          <ExportCsvButton
            count={filtered.length}
            filename={() => `${csvName}-${csvDateStamp()}.csv`}
            build={buildCsv}
          />
        </div>
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-black/10 px-5 py-3 dark:border-white/10">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{num(units)}</span>
            <span className="text-sm text-neutral-500">
              unit{units === 1 ? '' : 's'} {verb} in {num(filtered.length)} entr{filtered.length === 1 ? 'y' : 'ies'}
            </span>
          </div>
          {returnRows ? (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={`text-2xl font-semibold tabular-nums ${returnedUnits > 0 ? 'text-amber-500' : ''}`}>
                {num(returnedUnits)}
              </span>
              <span className="text-sm text-neutral-500">
                returned in {num(returnsInView.length)} entr{returnsInView.length === 1 ? 'y' : 'ies'}
                {returnedUnits > 0 ? ` · ${returnRate}%` : ''}
              </span>
            </div>
          ) : null}
        </div>
        <span className="text-xs text-neutral-400">
          {fCategory === 'all' ? 'All categories' : fCategory || 'No category'} · {rangeLabel(fromDate, toDate)}
          {fPlatform === 'all' ? '' : ` · ${PLATFORM_LABELS[fPlatform as Platform] ?? fPlatform}`}
        </span>
      </div>

      <Table
        head={<><Th>{dateLabel}</Th><Th>Product</Th><Th>Tracking</Th><Th>Order no.</Th><Th>Platform</Th><Th right>Qty</Th><Th right>Edit</Th></>}
        empty={filtered.length === 0}
      >
        {pageRows.map((r) => (
          <Tr key={r.id}>
            <Td>{dateOnly(r.at)}</Td>
            <Td>
              <div className="font-medium">
                {r.name}
                {r.color ? ` — ${r.color}` : ''}
                {r.size ? <span className="text-neutral-500"> · {r.size}</span> : null}
              </div>
              <div className="font-mono text-[11px] text-neutral-500">{r.sku}</div>
              {r.condition && r.condition !== 'GOOD' ? (
                <div className={`text-[11px] ${r.condition === 'WRONG' ? 'text-red-500' : 'text-amber-500'}`}>
                  {RETURN_CONDITION_LABELS[r.condition as ReturnCondition] ?? r.condition}
                  {r.condition === 'WRONG' ? ' — kept out of stock' : ' — back in stock'}
                </div>
              ) : null}
            </Td>
            <Td>
              {r.trackingId ? <span className="font-mono text-xs">{r.trackingId}</span> : <span className="text-xs text-neutral-400">—</span>}
            </Td>
            <Td>{r.orderId ? <span className="font-mono text-xs">{r.orderId}</span> : <span className="text-xs text-neutral-400">—</span>}</Td>
            <Td>{platformLabel(r.channel)}</Td>
            <Td right>{r.qty}</Td>
            <Td right><EditMovementButton row={r} title={dateLabel === 'Returned' ? 'return' : 'shipment'} /></Td>
          </Tr>
        ))}
      </Table>

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-3 dark:border-white/10">
          <span className="text-sm text-neutral-500">Showing {from}–{to} of {filtered.length}</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              aria-label="Entries per page"
              className={filterCls}
            >
              {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button onClick={() => setPage(cur - 1)} disabled={cur <= 1} className={pagerBtnCls}>‹ Prev</button>
            <span className="text-sm tabular-nums text-neutral-500">Page {cur} of {pageCount}</span>
            <button onClick={() => setPage(cur + 1)} disabled={cur >= pageCount} className={pagerBtnCls}>Next ›</button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
