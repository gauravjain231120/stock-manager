'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Pencil, Printer } from 'lucide-react';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { EditableStock } from '@/components/EditableStock';
import { ExportCsvButton } from '@/components/ExportCsvButton';
import { RevealableStats } from '@/components/RevealableStats';
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

export function InventoryTable({
  rows,
  dateFrom = '',
  dateTo = '',
}: {
  rows: InvRow[];
  /** Shipped/Returned narrowed to this window server-side — on-hand stays current. */
  dateFrom?: string;
  dateTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [color, setColor] = useState('');

  // A colour picked under one category rarely exists in another, so changing
  // category clears it rather than silently filtering to nothing.
  function selectCategory(next: string) {
    setCat(next);
    setColor('');
  }

  function setDateRange(next: { from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const nf = next.from !== undefined ? next.from : dateFrom;
    const nt = next.to !== undefined ? next.to : dateTo;
    if (nf) params.set('from', nf); else params.delete('from');
    if (nt) params.set('to', nt); else params.delete('to');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  // Only the colours actually present in the chosen category — picking "All
  // categories" first shows every colour in the whole inventory instead.
  const colorsInCategory = [...new Set(rows.filter((r) => !cat || r.category === cat).map((r) => r.color).filter(Boolean))].sort() as string[];

  const filtered = rows
    .filter((r) => {
      if (cat && r.category !== cat) return false;
      if (color && r.color !== color) return false;
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
            onChange={(e) => selectCategory(e.target.value)}
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white sm:w-auto"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {cat && colorsInCategory.length > 0 ? (
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white sm:w-auto"
            >
              <option value="">All colours</option>
              {colorsInCategory.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : null}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU, name or category…"
            className="w-full flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white sm:w-auto sm:min-w-[16rem]"
          />
          <label className="flex items-center gap-1.5 text-sm text-neutral-500">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateRange({ from: e.target.value })}
              className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-neutral-500">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateRange({ to: e.target.value })}
              className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
            />
          </label>
          {dateFrom || dateTo ? (
            <button
              type="button"
              onClick={() => setDateRange({ from: '', to: '' })}
              className="text-xs font-medium text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Clear dates
            </button>
          ) : null}
          <ExportCsvButton
            count={filtered.length}
            filename={() => `inventory-${csvDateStamp()}.csv`}
            build={buildCsv}
          />
          <Link
            href={`/inventory/print?print=1${cat ? `&category=${encodeURIComponent(cat)}` : ''}${color ? `&color=${encodeURIComponent(color)}` : ''}`}
            target="_blank"
            title={cat ? `Print just ${[cat, color].filter(Boolean).join(' — ')}` : 'Print the whole inventory — product, size, available'}
            className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            <Printer size={14} />
            Print
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div className="text-sm">
            <div className="font-medium">{[cat || 'All categories', color].filter(Boolean).join(' — ')}</div>
            <div className="text-xs text-neutral-400">
              {filtered.length} {filtered.length === 1 ? 'variant' : 'variants'} — every colour and size added together
            </div>
            <div className="text-xs text-neutral-400">
              Shipped/Returned: {dateFrom || dateTo ? `${dateFrom || 'start'} – ${dateTo || 'now'}` : 'all time'} · On hand/Available: current
            </div>
          </div>
          <RevealableStats>
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
          </RevealableStats>
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
                <Tr className="bg-brand-50 font-semibold text-brand-900 dark:bg-brand-500/10 dark:text-brand-100">
                  <Td>Total</Td>
                  <Td right>{gt.shipped}</Td>
                  <Td right>{gt.returned}</Td>
                  <Td right>
                    {/* Matches EditableStock's layout (incl. its reserved icon space)
                        so this plain total lines up under the editable values above it. */}
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums">
                      {gt.onHand}
                      <Pencil size={11} className="invisible" />
                    </span>
                  </Td>
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
