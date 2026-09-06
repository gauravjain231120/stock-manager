'use client';

import { Fragment, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { PendingRowActions } from '@/components/PendingRowActions';
import { ShipOrderButton } from '@/components/ShipOrderButton';
import { PlatformFilter } from '@/components/PlatformFilter';
import { ShipDateFilter } from '@/components/ShipDateFilter';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';
import { dateTime, dayKey } from '@/lib/format';

export interface QueueRow {
  id: string;
  sku: string;
  /** The SKU whose physical stock this entry ships (differs for bundle sets). */
  stockSku: string;
  /** That SKU's product name, e.g. "Co-ord Set" — only set when it isn't this one. */
  stockName: string | null;
  name: string;
  /** The product's category, e.g. "Coord set" — empty when it has none. */
  category: string;
  qty: number;
  channel: string | null;
  /**
   * Units of this row's pile still free for it, once the orders queued ahead of
   * it have taken theirs. A pile of 1 with two orders on it leaves the second
   * row 0 — the first order already has that garment spoken for.
   */
  free: number;
  after: number;
  /** True when this row wants more than is left for it (blocks Ship all). */
  short: boolean;
  /** Companion stock shown for reference next to bundles (never deducted). */
  info: { sku: string; label: string; onHand: number } | null;
  orderId: string | null;
  trackingId: string | null;
  /** When the marketplace order was actually placed (set by an order-alert integration, if any). */
  placedAt: string | null;
  shipByAt: string | null;
  /** Packed and set aside — kept off the print sheet so it isn't packed twice. */
  ready: boolean;
}

function platformLabel(c?: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

function stockStatus(n: number) {
  if (n <= 0) return { label: 'Out of stock', tone: 'danger' as const, color: 'text-red-600' };
  if (n <= 5) return { label: 'Low', tone: 'warn' as const, color: 'text-amber-600' };
  return { label: 'Good', tone: 'good' as const, color: 'text-emerald-600' };
}

const checkboxCls = 'size-4 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40';
const filterCls = 'rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

/** The Ready-to-Ship queue: filterable table with per-row Ship/Cancel, multi-select, and Ship all. */
export function ShipQueue({
  rows,
  totalCount,
  platform,
  products,
}: {
  rows: QueueRow[];
  totalCount: number;
  platform: Platform | null;
  products: { sku: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fCategory, setFCategory] = useState('all');
  const [fReady, setFReady] = useState<'all' | 'ready' | 'not-ready'>('all');
  const [fShipDate, setFShipDate] = useState<'all' | 'today' | 'tomorrow' | 'overdue'>('all');
  // A SET of exact calendar dates, picked via ShipDateFilter, lives in the URL
  // (not local state) so the Print queue link can carry the same set too — it
  // takes priority over the quick preset dropdown when any are picked.
  const exactDates = (useSearchParams().get('dates') ?? '').split(',').filter(Boolean);

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  const todayKey = dayKey(new Date());
  const tomorrowKey = dayKey(new Date(Date.now() + 86400_000));
  function matchesShipDate(r: QueueRow) {
    if (exactDates.length > 0) return exactDates.includes(dayKey(r.shipByAt));
    if (fShipDate === 'all') return true;
    if (!r.shipByAt) return false;
    const key = dayKey(r.shipByAt);
    if (fShipDate === 'today') return key === todayKey;
    if (fShipDate === 'tomorrow') return key === tomorrowKey;
    return key < todayKey; // overdue
  }
  function matchesReady(r: QueueRow) {
    if (fReady === 'all') return true;
    return fReady === 'ready' ? r.ready : !r.ready;
  }
  // "" is a real choice here — the queued products that have no category at all.
  const visible = rows.filter((r) => (fCategory === 'all' || r.category === fCategory) && matchesShipDate(r) && matchesReady(r));

  // Rows that can be ticked: enough left for this row to ship it in full.
  const selectable = visible.filter((r) => r.free >= r.qty && r.qty > 0);
  // Only what's on screen counts as selected — a row the filter hides must never
  // ship on the back of a button that says it ships what you can see.
  const sel = visible.filter((r) => selected.has(r.id));
  const selUnits = sel.reduce((a, r) => a + r.qty, 0);
  // The same physical pool picked on several rows (same SKU on two platforms, or
  // a bundle + its component) can still overrun stock — check per-pool sums. The
  // headroom is the EARLIEST ticked row's free count, since rows are in queue
  // order and every later row's count already nets off the ones above it.
  const selBySku = new Map<string, { qty: number; free: number }>();
  for (const r of sel) {
    const e = selBySku.get(r.stockSku) ?? { qty: 0, free: r.free };
    e.qty += r.qty;
    selBySku.set(r.stockSku, e);
  }
  const selShort = [...selBySku.values()].some((e) => e.qty > e.free);

  // Lines of the same order ship as one parcel, so keep them together and give
  // multi-item orders a header with a single "ship it all" action. Counted over
  // the whole queue, not the filtered view: "Ship whole order" ships every line
  // of the order, so its header must keep saying what that really is.
  const orderCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.orderId) orderCounts.set(r.orderId, (orderCounts.get(r.orderId) ?? 0) + 1);
  }
  const multiOrders = new Set([...orderCounts.entries()].filter(([, n]) => n > 1).map(([o]) => o));
  const ordered = [...visible].sort((a, b) => {
    const ao = a.orderId && multiOrders.has(a.orderId) ? a.orderId : '';
    const bo = b.orderId && multiOrders.has(b.orderId) ? b.orderId : '';
    if (ao !== bo) return ao && bo ? ao.localeCompare(bo) : ao ? -1 : 1;
    return 0;
  });

  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const shownUnits = visible.reduce((a, r) => a + r.qty, 0);
  const shownShort = visible.some((r) => r.short);
  const categoryLabel = fCategory === 'all' ? null : fCategory || 'No category';
  const shipDateLabel = exactDates.length > 0 ? exactDates.join(', ') : fShipDate !== 'all' ? fShipDate : null;
  const readyLabel = fReady === 'all' ? null : fReady === 'ready' ? 'Ready' : 'Not ready';
  // Anything beyond the platform filter (category, ship date, ready) narrows
  // the view client-side, so "Ship all" in that case must ship exactly the
  // visible rows by id — the server-side /api/pending/ship-all endpoint only
  // knows how to filter by platform, so it can't be trusted to also respect
  // these. Previously only categoryLabel was checked here, so ship-all with
  // just a date filter active silently shipped the WHOLE queue instead of
  // the filtered date — a real incident, not hypothetical.
  const hasNarrowFilter = Boolean(categoryLabel) || Boolean(shipDateLabel) || Boolean(readyLabel);
  // What "all" currently means, spelled out on the Ship all button.
  const scope = [platform ? PLATFORM_LABELS[platform] : null, categoryLabel, shipDateLabel, readyLabel]
    .filter(Boolean)
    .join(' · ');

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(selectable.map((r) => r.id)));
  }

  return (
    <Panel
      title={`Queue (${platform || categoryLabel || fShipDate !== 'all' || exactDates.length > 0 ? `${visible.length} of ${totalCount}` : totalCount})`}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            value={fCategory}
            onChange={(e) => setFCategory(e.target.value)}
            aria-label="Filter by category"
            className={filterCls}
          >
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            {rows.some((r) => !r.category) ? <option value="">No category</option> : null}
          </select>
          <PlatformFilter />
          <select
            value={fReady}
            onChange={(e) => setFReady(e.target.value as typeof fReady)}
            aria-label="Filter by packed status"
            className={filterCls}
          >
            <option value="all">Ready + Not ready</option>
            <option value="ready">Ready</option>
            <option value="not-ready">Not ready</option>
          </select>
          <select
            value={fShipDate}
            onChange={(e) => setFShipDate(e.target.value as typeof fShipDate)}
            aria-label="Filter by ship-by date preset"
            title={exactDates.length > 0 ? 'Specific dates are selected — clear them to use these presets' : undefined}
            disabled={exactDates.length > 0}
            className={filterCls}
          >
            <option value="all">Any ship date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Ship by today</option>
            <option value="tomorrow">Ship by tomorrow</option>
          </select>
          <ShipDateFilter />
          {visible.length > 0 ? (
            <>
              <ActionButton
                label={`Ship selected (${sel.length})`}
                endpoint="/api/pending/ship-selected"
                method="POST"
                body={{ ids: sel.map((r) => r.id) }}
                variant="primary"
                confirmTitle="Ship selected items?"
                confirm={`${sel.length} item(s) will be marked shipped and their stock deducted.`}
                confirmDetails={[{ label: 'Items', value: String(sel.length) }, { label: 'Units', value: String(selUnits) }]}
                confirmLabel="Ship selected"
                successMessage="Shipped ✓"
                disabled={sel.length === 0 || selShort}
                title={
                  sel.length === 0
                    ? 'Tick some items in the queue first'
                    : selShort
                      ? 'Not enough stock for some selected items'
                      : undefined
                }
              />
              <ActionButton
                label={scope ? `Ship all ${scope}` : 'Ship all'}
                // "Ship all" always means "all of what's in view". The platform
                // filter lives in the URL so the server can scope it there; any
                // OTHER active filter (category or ship date) has no server-side
                // equivalent, so those cases must ship the visible rows by id
                // instead of trusting /api/pending/ship-all to also filter them.
                endpoint={hasNarrowFilter ? '/api/pending/ship-selected' : '/api/pending/ship-all'}
                method="POST"
                body={hasNarrowFilter ? { ids: visible.map((r) => r.id) } : platform ? { channel: platform } : undefined}
                variant="primary"
                confirmTitle="Ship everything?"
                confirm={`All ${visible.length} item(s)${scope ? ` on ${scope}` : ''} will be marked shipped and their stock deducted.`}
                confirmDetails={[
                  ...(categoryLabel ? [{ label: 'Category', value: categoryLabel }] : []),
                  ...(shipDateLabel ? [{ label: 'Ship date', value: shipDateLabel }] : []),
                  ...(readyLabel ? [{ label: 'Status', value: readyLabel }] : []),
                  { label: 'Items', value: String(visible.length) },
                  { label: 'Units', value: String(shownUnits) },
                ]}
                confirmLabel="Ship all"
                successMessage="All shipped ✓"
                disabled={shownShort}
                title={shownShort ? 'Some items are out of stock — produce them or remove them first' : undefined}
              />
            </>
          ) : null}
        </div>
      }
    >
      <Table
        head={
          <>
            <Th>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                disabled={selectable.length === 0}
                aria-label="Select all shippable items"
                className={checkboxCls}
              />
            </Th>
            <Th>Product</Th><Th>Platform</Th><Th right>Stock</Th><Th right>Status</Th><Th right>Qty</Th><Th right>After ship</Th><Th right>Action</Th>
          </>
        }
        empty={visible.length === 0}
      >
        {ordered.map((p, i) => {
          const s = stockStatus(p.free);
          const canSelect = p.free >= p.qty && p.qty > 0;
          // First line of a multi-item order gets the "ship it all together" header.
          const grouped = Boolean(p.orderId && multiOrders.has(p.orderId));
          const isGroupStart = grouped && (i === 0 || ordered[i - 1].orderId !== p.orderId);
          const isGroupEnd = grouped && (i === ordered.length - 1 || ordered[i + 1].orderId !== p.orderId);
          // Every line of the order, filtered-out ones included — this header's
          // Ship button packs the lot, so it must count and list the lot.
          const groupRows = grouped ? rows.filter((r) => r.orderId === p.orderId) : [];
          const groupShort = groupRows.filter((r) => r.free < r.qty);
          // Tinted band + left accent so the lines of one parcel read as a block.
          const bandCls = grouped ? 'bg-brand-50/70 dark:bg-white/[0.04]' : '';
          const accentCls = grouped ? 'border-l-4 border-brand-600' : '';
          return (
            <Fragment key={p.id}>
            {isGroupStart ? (
              <Tr className={bandCls}>
                <Td colSpan={8} className={accentCls}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5">
                    <span className="rounded-md bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                      Pack together
                    </span>
                    <span className="font-mono text-sm font-medium">Order {p.orderId}</span>
                    <span className="text-xs text-neutral-500">
                      {groupRows.length} items · {groupRows.reduce((a, r) => a + r.qty, 0)} units — one parcel, one tracking number
                    </span>
                    {groupShort.length > 0 ? (
                      <span className="text-xs font-medium text-red-500">
                        {groupShort.length} item{groupShort.length === 1 ? '' : 's'} out of stock — produce first
                      </span>
                    ) : null}
                    <span className="ml-auto">
                      <ShipOrderButton
                        orderId={p.orderId!}
                        items={groupRows.map((r) => ({ sku: r.sku, name: r.name, qty: r.qty, free: r.free }))}
                        trackingId={groupRows.find((r) => r.trackingId)?.trackingId ?? null}
                      />
                    </span>
                  </div>
                </Td>
              </Tr>
            ) : null}
            <Tr className={`${bandCls} ${isGroupEnd ? 'border-b-2 border-brand-600/30' : ''}`}>
              <Td className={accentCls}>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={!canSelect}
                  title={canSelect ? undefined : 'Not enough stock left for this order — earlier orders come first'}
                  aria-label={`Select ${p.sku}`}
                  className={checkboxCls}
                />
              </Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  <span>{p.name}</span>
                  {p.ready ? <Badge tone="good">Ready</Badge> : null}
                </div>
                <div className="font-mono text-[11px] text-neutral-400">{p.sku}</div>
                {/* The order number sits in the group header, so don't repeat it on every line. */}
                {p.orderId && !grouped ? <div className="text-[11px] text-neutral-400">Order {p.orderId}</div> : null}
                {p.trackingId ? <div className="font-mono text-[11px] text-emerald-600">#{p.trackingId}</div> : null}
                {p.placedAt ? <div className="text-[11px] text-neutral-400">Placed {dateTime(p.placedAt)}</div> : null}
                {p.shipByAt ? <div className="text-[11px] text-amber-500">Ship by {dateTime(p.shipByAt)}</div> : null}
                {p.stockSku !== p.sku ? (
                  <div className="text-[11px] text-amber-500">
                    shares stock — takes {p.qty} {p.stockName ?? 'unit'} ({p.stockSku})
                    {p.info ? ` (${p.info.label}: ${p.info.onHand})` : ''}
                  </div>
                ) : null}
              </Td>
              <Td>{platformLabel(p.channel)}</Td>
              <Td right><span className={`font-semibold ${s.color}`}>{p.free}</span></Td>
              <Td right>
                {p.after < 0 ? (
                  <Badge tone="danger">Out of stock (make {-p.after})</Badge>
                ) : (
                  <Badge tone={s.tone}>{s.label}</Badge>
                )}
              </Td>
              <Td right>{p.qty}</Td>
              <Td right><span className={`font-semibold ${stockStatus(p.after).color}`}>{p.after}</span></Td>
              <Td right>
                <PendingRowActions row={p} products={products} grouped={grouped} />
              </Td>
            </Tr>
            </Fragment>
          );
        })}
      </Table>
    </Panel>
  );
}
