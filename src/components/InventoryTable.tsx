'use client';

import { useState } from 'react';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { EditableStock } from '@/components/EditableStock';
import { ExportCsvButton } from '@/components/ExportCsvButton';
import { toCsv, csvDateStamp } from '@/lib/csv';
import { compareVariant, groupVariants, matchesSearch, num } from '@/lib/format';

export interface InvRow {
  sku: string;
  name: string;
  category: string;
  onHand: number;
  shipped: number;
  returned: number;
  color?: string;
  size?: string;
  /** On-hand minus units already reserved by the ship queue. */
  available?: number;
  /** True for bundles, whose on-hand is another SKU's pile — don't sum it twice. */
  sharedStock?: boolean;
}

// 0 = make it, 1–5 = low, >5 = good.
function stockStatus(onHand: number) {
  if (onHand <= 0) return { label: 'Out of stock', tone: 'danger' as const, color: 'text-red-600' };
  if (onHand <= 5) return { label: 'Low', tone: 'warn' as const, color: 'text-amber-600' };
  return { label: 'Good', tone: 'good' as const, color: 'text-emerald-600' };
}

export function InventoryTable({ rows }: { rows: InvRow[] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();

  const filtered = rows
    .filter((r) => {
      if (cat && r.category !== cat) return false;
      if (q.trim() && !matchesSearch(`${r.sku} ${r.name} ${r.category}`, q, r.sku)) return false;
      return true;
    })
    .sort((a, b) => compareVariant(a.sku, b.sku));

  const groups = groupVariants(filtered, (r) => r.sku.split('-').pop() ?? '');

  // Shipped/returned for everything currently in view — every colour and size of
  // the chosen category rolled into one number. Safe to add up: both come from
  // this SKU's own ledger rows, so a bundle never counts twice (unlike on-hand,
  // which it shares with its component SKU).
  const totals = filtered.reduce(
    (a, r) => ({ shipped: a.shipped + r.shipped, returned: a.returned + r.returned }),
    { shipped: 0, returned: 0 },
  );

  function buildCsv() {
    return toCsv(
      ['SKU', 'Product', 'Colour', 'Size', 'In stock', 'Available', 'Shipped', 'Returned', 'Status', 'Shared stock'],
      filtered.map((r) => [
        r.sku,
        r.category || r.name,
        r.color ?? '',
        r.size ?? r.sku.split('-').pop() ?? '',
        r.onHand,
        r.available ?? r.onHand,
        r.shipped,
        r.returned,
        stockStatus(r.onHand).label,
        r.sharedStock ? 'Yes' : 'No',
      ]),
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-3 text-sm font-medium">All products ({filtered.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white sm:w-auto"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU, name or category…"
            className="w-full flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white sm:w-auto sm:min-w-[16rem]"
          />
          <ExportCsvButton
            count={filtered.length}
            filename={() => `inventory-${csvDateStamp()}.csv`}
            build={buildCsv}
          />
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div className="text-sm">
            <div className="font-medium">{cat || 'All categories'}</div>
            <div className="text-xs text-neutral-400">
              {filtered.length} {filtered.length === 1 ? 'variant' : 'variants'} — every colour and size added together
            </div>
          </div>
          <div className="flex gap-8">
            <div>
              <div className="text-xs text-neutral-500">Total shipped</div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums">{num(totals.shipped)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Total returned</div>
              <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${totals.returned > 0 ? 'text-amber-500' : ''}`}>
                {num(totals.returned)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <Panel><div className="px-5 py-8 text-center text-sm text-neutral-400">No matches.</div></Panel>
      ) : (
        groups.map((g) => {
          // Every size of this one colour, added up for the row that closes the table.
          const gt = g.rows.reduce(
            (a, r) => ({
              shipped: a.shipped + r.shipped,
              returned: a.returned + r.returned,
              onHand: a.onHand + r.onHand,
              available: a.available + (r.available ?? r.onHand),
            }),
            { shipped: 0, returned: 0, onHand: 0, available: 0 },
          );
          return (
            <Panel key={g.key} title={g.title} actions={<span className="text-xs text-neutral-400">{gt.onHand} on hand</span>}>
              <Table head={<><Th>Size</Th><Th right>Shipped</Th><Th right>Returned</Th><Th right>On hand</Th><Th right>Available</Th><Th right>Status</Th></>}>
                {g.rows.map((r) => {
                  const s = stockStatus(r.onHand);
                  const avail = r.available ?? r.onHand;
                  return (
                    <Tr key={r.sku}>
                      <Td>{r.sku.split('-').pop()}</Td>
                      <Td right>{r.shipped}</Td>
                      <Td right>{r.returned}</Td>
                      <Td right><EditableStock sku={r.sku} value={r.onHand} /></Td>
                      <Td right className={avail < r.onHand ? 'text-amber-600' : undefined}>{avail}</Td>
                      <Td right><Badge tone={s.tone}>{s.label}</Badge></Td>
                    </Tr>
                  );
                })}
                <Tr className="bg-black/[0.03] font-semibold dark:bg-white/[0.04]">
                  <Td>Total</Td>
                  <Td right>{gt.shipped}</Td>
                  <Td right>{gt.returned}</Td>
                  <Td right>{gt.onHand}</Td>
                  <Td right>{gt.available}</Td>
                  <Td right />
                </Tr>
              </Table>
            </Panel>
          );
        })
      )}
    </div>
  );
}
