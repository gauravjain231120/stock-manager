'use client';

import { useState } from 'react';
import { Panel, Table, Th, Td, Tr } from '@/components/ui';
import { dateOnly, matchesSearch } from '@/lib/format';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
import type { ShippedRow } from '@/lib/shipping';

const filterCls = 'rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white';
const pagerBtnCls =
  'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10';
const PER_PAGE_OPTIONS = [20, 50, 80, 100, 200, 300];

function platformLabel(c: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

/** Everything that has gone out, with its tracking number — searchable and paged. */
export function ShippedTable({ rows }: { rows: ShippedRow[] }) {
  const [q, setQ] = useState('');
  const [fPlatform, setFPlatform] = useState('all');
  const [onlyUntracked, setOnlyUntracked] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const filtered = rows.filter((r) => {
    if (fPlatform !== 'all' && r.channel !== fPlatform) return false;
    if (onlyUntracked && r.trackingId) return false;
    if (!q.trim()) return true;
    const hay = `${r.sku} ${r.name} ${r.color} ${r.size} ${r.trackingId ?? ''} ${r.orderId ?? ''} ${platformLabel(r.channel)}`;
    return matchesSearch(hay, q, r.sku);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const cur = Math.min(page, pageCount);
  const pageRows = filtered.slice((cur - 1) * perPage, cur * perPage);
  const from = filtered.length === 0 ? 0 : (cur - 1) * perPage + 1;
  const to = Math.min(cur * perPage, filtered.length);

  return (
    <Panel
      title={`Shipped (${filtered.length})`}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
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
        </div>
      }
    >
      <Table
        head={<><Th>Shipped</Th><Th>Product</Th><Th>Tracking</Th><Th>Order no.</Th><Th>Platform</Th><Th right>Qty</Th></>}
        empty={filtered.length === 0}
      >
        {pageRows.map((r) => (
          <Tr key={r.id}>
            <Td>{dateOnly(r.shippedAt)}</Td>
            <Td>
              <div className="font-medium">
                {r.name}
                {r.color ? ` — ${r.color}` : ''}
                {r.size ? <span className="text-neutral-500"> · {r.size}</span> : null}
              </div>
              <div className="font-mono text-[11px] text-neutral-500">{r.sku}</div>
            </Td>
            <Td>
              {r.trackingId ? (
                <span className="font-mono text-xs">{r.trackingId}</span>
              ) : (
                <span className="text-xs text-neutral-400">—</span>
              )}
            </Td>
            <Td>{r.orderId ? <span className="font-mono text-xs">{r.orderId}</span> : <span className="text-xs text-neutral-400">—</span>}</Td>
            <Td>{platformLabel(r.channel)}</Td>
            <Td right>{r.qty}</Td>
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
