'use client';

import { Fragment, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, Package, X, Clock } from 'lucide-react';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { PendingRowActions } from '@/components/PendingRowActions';
import { ShipOrderButton } from '@/components/ShipOrderButton';
import { PlatformFilter } from '@/components/PlatformFilter';
import { ShipDateFilter } from '@/components/ShipDateFilter';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';
import { dateTime, dayKey, compareSize } from '@/lib/format';
import type { ShipProduct } from '@/lib/shipping';

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
  /** The variant's colour attribute, e.g. "Blue-Bandhej" — empty when it has none. */
  color: string;
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

function showCompanionInfo(r: QueueRow) {
  // Halter with Salwar still uses shared stock, but its extra Co-ord Set
  // reference line is more confusing than helpful in the queue.
  return r.category !== 'Halter with Salwar';
}

const SWATCHES: [RegExp, string][] = [
  [/black/i, '#23262c'],
  [/white|ivory|cream/i, '#efeae0'],
  [/gre[ya]/i, '#8b9099'],
  [/navy/i, '#22335c'],
  [/blue/i, '#3070cf'],
  [/maroon/i, '#7d2b2b'],
  [/red/i, '#c53a33'],
  [/green|olive/i, '#3f7d4e'],
  [/pink|rose/i, '#dd6f92'],
  [/yellow|mustard/i, '#dfb03c'],
  [/orange|rust/i, '#d8752f'],
  [/purple|violet/i, '#7a52b3'],
  [/brown|beige|tan/i, '#98764f'],
];

function swatch(name: string): string {
  return SWATCHES.find(([re]) => re.test(name))?.[1] ?? '#9ca3af';
}

interface SiblingSize {
  sku: string;
  name: string;
  sizeLabel: string;
  color: string;
  onHand: number;
  available: number;
  isCurrent: boolean;
}

interface SiblingGroup {
  styleName: string;
  groupCode?: string;
  currentColor: string;
  colorSizes: SiblingSize[];
  otherColors: { color: string; sizes: SiblingSize[] }[];
}

function getProductSizes(row: QueueRow, catalog: ShipProduct[]): SiblingGroup {
  const direct = catalog.find((c) => c.sku === row.sku) || catalog.find((c) => c.sku === row.stockSku);
  const groupCode = direct?.groupCode?.trim() || '';
  const groupName = direct?.groupName?.trim() || '';
  const color = (direct?.color || row.color || '').trim();

  const cutSku = (s: string) => {
    const idx = s.lastIndexOf('-');
    return idx > 0 ? s.slice(0, idx) : s;
  };
  const rowPrefix = cutSku(row.sku);
  const stockPrefix = cutSku(row.stockSku);

  let pool: ShipProduct[] = [];

  if (groupCode) {
    pool = catalog.filter((c) => c.groupCode?.trim().toUpperCase() === groupCode.toUpperCase());
  }

  if (pool.length <= 1) {
    const byPrefix = catalog.filter((c) => {
      const pfx = cutSku(c.sku);
      return pfx === rowPrefix || (stockPrefix && pfx === stockPrefix);
    });
    if (byPrefix.length > pool.length) {
      pool = byPrefix;
    }
  }

  if (pool.length <= 1 && color && (row.category || direct?.category)) {
    const cat = (row.category || direct?.category || '').trim().toLowerCase();
    const byCat = catalog.filter((c) => {
      return (c.category?.trim().toLowerCase() === cat) && (c.color?.trim().toLowerCase() === color.toLowerCase());
    });
    if (byCat.length > pool.length) {
      pool = byCat;
    }
  }

  if (pool.length === 0 && direct) {
    pool = [direct];
  }

  const toSibling = (p: ShipProduct): SiblingSize => {
    const sLabel = (p.size?.trim() || p.sku.split('-').pop() || 'OS').toUpperCase();
    return {
      sku: p.sku,
      name: p.name,
      sizeLabel: sLabel,
      color: p.color?.trim() || color || 'Default',
      onHand: p.onHand ?? 0,
      available: p.available ?? p.onHand ?? 0,
      isCurrent: p.sku === row.sku || p.sku === row.stockSku,
    };
  };

  // Group by color first
  const colorMap = new Map<string, ShipProduct[]>();
  for (const p of pool) {
    const cColor = p.color?.trim() || color || 'Default';
    const list = colorMap.get(cColor) ?? [];
    list.push(p);
    colorMap.set(cColor, list);
  }

  // Deduplicate by size for each color: prevent "double double" when multiple SKUs exist for the same size!
  const candidateScore = (sku: string): number => {
    if (sku === row.sku) return 100;
    if (sku === row.stockSku) return 90;
    const pfx = cutSku(sku);
    if (rowPrefix && pfx === rowPrefix) return 80;
    if (stockPrefix && pfx === stockPrefix) return 70;
    return 10;
  };

  const dedupeSizesForColor = (items: ShipProduct[]): SiblingSize[] => {
    const bySize = new Map<string, { product: ShipProduct; score: number }>();
    for (const p of items) {
      const sLabel = (p.size?.trim() || p.sku.split('-').pop() || 'OS').toUpperCase();
      const score = candidateScore(p.sku);
      const existing = bySize.get(sLabel);
      if (!existing || score > existing.score) {
        bySize.set(sLabel, { product: p, score });
      }
    }
    return [...bySize.values()]
      .map(({ product }) => toSibling(product))
      .sort((a, b) => compareSize(a.sizeLabel, b.sizeLabel));
  };

  let currentKey = [...colorMap.keys()].find((k) => k.toLowerCase() === color.toLowerCase());
  if (!currentKey && colorMap.size > 0) {
    currentKey = colorMap.keys().next().value;
  }

  const colorSizes = currentKey ? dedupeSizesForColor(colorMap.get(currentKey) ?? []) : [];

  const otherColors: { color: string; sizes: SiblingSize[] }[] = [];
  for (const [cName, list] of colorMap.entries()) {
    if (currentKey && cName.toLowerCase() === currentKey.toLowerCase()) continue;
    otherColors.push({
      color: cName,
      sizes: dedupeSizesForColor(list),
    });
  }

  return {
    styleName: groupName || direct?.name || row.name,
    groupCode: groupCode || undefined,
    currentColor: currentKey || color || '',
    colorSizes,
    otherColors,
  };
}

const checkboxCls = 'size-4 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40';
const filterCls = 'rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white max-w-full w-full sm:w-auto truncate';

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
  products: ShipProduct[];
  rtdCutoff?: string;
  holidays?: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [activeColorByRow, setActiveColorByRow] = useState<Record<string, string>>({});
  const [fCategory, setFCategory] = useState('all');
  const [fColor, setFColor] = useState('all');
  const [fReady, setFReady] = useState<'all' | 'ready' | 'not-ready'>('all');
  const [fShipDate, setFShipDate] = useState<'all' | 'today' | 'tomorrow' | 'overdue'>('all');
  const [fMyntraRtd, setFMyntraRtd] = useState(false);
  // A SET of exact calendar dates, picked via ShipDateFilter, lives in the URL
  // (not local state) so the Print queue link can carry the same set too — it
  // takes priority over the quick preset dropdown when any are picked.
  const exactDates = (useSearchParams().get('dates') ?? '').split(',').filter(Boolean);

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  const categoryCounts = rows.reduce((acc, r) => {
    if (r.category) acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const noCategoryCount = rows.filter((r) => !r.category).length;

  // Only the colours actually present in the chosen category — picking "All
  // categories" first hides the colour picker entirely (see selectCategory).
  const rowsForColor = rows.filter((r) => fCategory === 'all' || r.category === fCategory);
  const colorsInCategory = [...new Set(rowsForColor.map((r) => r.color).filter(Boolean))].sort();
  const colorCounts = rowsForColor.reduce((acc, r) => {
    if (r.color) acc[r.color] = (acc[r.color] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  // A colour picked under one category rarely exists in another, so changing
  // category clears it rather than silently filtering to nothing.
  function selectCategory(next: string) {
    setFCategory(next);
    setFColor('all');
  }
  const now = new Date();
  const todayKey = dayKey(now);
  const tomorrowKey = dayKey(new Date(now.getTime() + 86400_000));
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
  // Filtered by everything EXCEPT the ready/not-ready dropdown, so its own
  // options can show counts for what picking each one would leave visible.
  const myntraRtdCount = rows.filter(
    (r) => r.channel === "MYNTRA" && r.shipByAt && dayKey(r.shipByAt) <= todayKey,
  ).length;

  const visibleBeforeReady = rows.filter(
    (r) =>
      (!fMyntraRtd || (r.channel === "MYNTRA" && r.shipByAt && dayKey(r.shipByAt) <= todayKey)) &&
      (fCategory === 'all' || r.category === fCategory) &&
      (fColor === 'all' || r.color === fColor) &&
      matchesShipDate(r),
  );
  const readyCount = visibleBeforeReady.filter((r) => r.ready).length;
  const notReadyCount = visibleBeforeReady.length - readyCount;
  const visible = visibleBeforeReady.filter(matchesReady);

  // Rows that can be ticked: enough left for this row to ship it in full.
  const selectable = visible.filter((r) => r.qty > 0);
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
  const selShort = false; // Auto-produces missing stock on ship

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
  const shownShort = false; // Auto-produces missing stock on ship
  const categoryLabel = fCategory === 'all' ? null : fCategory || 'No category';
  const colorLabel = fColor === 'all' ? null : fColor;
  const shipDateLabel = exactDates.length > 0 ? exactDates.join(', ') : fShipDate !== 'all' ? fShipDate : null;
  const readyLabel = fReady === 'all' ? null : fReady === 'ready' ? 'Ready' : 'Not ready';
  // Anything beyond the platform filter (category, colour, ship date, ready)
  // narrows the view client-side, so "Ship all" in that case must ship exactly
  // the visible rows by id — the server-side /api/pending/ship-all endpoint
  // only knows how to filter by platform, so it can't be trusted to also
  // respect these. Previously only categoryLabel was checked here, so
  // ship-all with just a date filter active silently shipped the WHOLE queue
  // instead of the filtered date — a real incident, not hypothetical.
  const hasNarrowFilter = fMyntraRtd || Boolean(categoryLabel) || Boolean(colorLabel) || Boolean(shipDateLabel) || Boolean(readyLabel);
  // What "all" currently means, spelled out on the Ship all button.
  const scope = [fMyntraRtd ? "Myntra RTD" : null, platform ? PLATFORM_LABELS[platform] : null, categoryLabel, colorLabel, shipDateLabel, readyLabel]
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

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
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
        <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 w-full">
          <select
            value={fCategory}
            onChange={(e) => selectCategory(e.target.value)}
            aria-label="Filter by category"
            className={filterCls}
          >
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c} ({categoryCounts[c]})</option>)}
            {noCategoryCount > 0 ? <option value="">No category ({noCategoryCount})</option> : null}
          </select>
          {/* Always rendered (even with nothing to pick yet) so the row after it
              doesn't jump position the moment a category is chosen. */}
          <select
            value={fColor}
            onChange={(e) => setFColor(e.target.value)}
            aria-label="Filter by colour"
            disabled={fCategory === 'all' || colorsInCategory.length === 0}
            title={fCategory === 'all' ? 'Pick a category first' : undefined}
            className={filterCls}
          >
            <option value="all">All colours</option>
            {colorsInCategory.map((c) => <option key={c} value={c}>{c} ({colorCounts[c]})</option>)}
          </select>
          <PlatformFilter />
          <select
            value={fReady}
            onChange={(e) => setFReady(e.target.value as typeof fReady)}
            aria-label="Filter by packed status"
            className={filterCls}
          >
            <option value="all">Ready ({readyCount}) + Not ready ({notReadyCount})</option>
            <option value="ready">Ready ({readyCount})</option>
            <option value="not-ready">Not ready ({notReadyCount})</option>
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
          <button
            type="button"
            onClick={() => setFMyntraRtd((prev) => !prev)}
            title={fMyntraRtd ? "Showing Myntra orders due today (click to clear)" : "Filter Myntra orders due today"}
            className={`inline-flex items-center gap-1.5 rounded-lg border text-sm transition px-3 py-1.5 ${
              fMyntraRtd
                ? "border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-300 font-semibold shadow-sm"
                : "border-black/15 bg-transparent text-neutral-800 hover:bg-black/5 dark:border-white/20 dark:text-neutral-200 dark:hover:bg-white/10"
            }`}
          >
            <Clock size={14} className={fMyntraRtd ? "text-brand-600 dark:text-brand-400" : "text-neutral-500"} />
            <span>Myntra RTD (Today)</span>
            {myntraRtdCount !== undefined ? (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[11px] ${
                  fMyntraRtd
                    ? "bg-brand-600 text-white dark:bg-brand-500"
                    : "bg-black/10 text-neutral-700 dark:bg-white/20 dark:text-neutral-200"
                }`}
              >
                {myntraRtdCount}
              </span>
            ) : null}
          </button>
          {visible.length > 0 ? (
            <>
              {/* Forces the Ship buttons onto their own line every time, so a long
                  "Ship all <category/colour/…>" label can't shift them between
                  sharing the filters' line and wrapping below it depending on
                  what's selected — they always start fresh, in the same place. */}
              <div className="h-0 basis-full" />
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
                disabled={sel.length === 0}
                title={sel.length === 0 ? 'Tick some items in the queue first' : undefined}
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
                  ...(colorLabel ? [{ label: 'Colour', value: colorLabel }] : []),
                  ...(shipDateLabel ? [{ label: 'Ship date', value: shipDateLabel }] : []),
                  ...(readyLabel ? [{ label: 'Status', value: readyLabel }] : []),
                  { label: 'Items', value: String(visible.length) },
                  { label: 'Units', value: String(shownUnits) },
                ]}
                confirmLabel="Ship all"
                successMessage="All shipped ✓"
                disabled={visible.length === 0}
                title={visible.length === 0 ? 'Nothing in the queue to ship' : undefined}
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
          const canSelect = p.qty > 0;
          const isExpanded = expandedRows.has(p.id);
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
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        {groupShort.length} item{groupShort.length === 1 ? '' : 's'} out of stock (will auto-produce)
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
            <Tr className={`${bandCls} ${isGroupEnd && !isExpanded ? 'border-b-2 border-brand-600/30' : ''}`}>
              <Td className={accentCls}>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={!canSelect}
                  
                  aria-label={`Select ${p.sku}`}
                  className={checkboxCls}
                />
              </Td>
              <Td>
                <div className="flex items-start justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    className="group/name flex items-start gap-1.5 text-left font-medium text-neutral-900 transition hover:text-brand-600 dark:text-neutral-100 dark:hover:text-brand-400"
                    title="Click to view all size stock for this product"
                  >
                    <span className="underline-offset-2 hover:underline">{p.name}</span>
                    <span className="mt-0.5 inline-flex items-center gap-0.5 rounded border border-neutral-200 bg-neutral-50 px-1 py-0.2 text-[10px] font-normal text-neutral-500 transition group-hover/name:border-brand-500/40 group-hover/name:bg-brand-50 group-hover/name:text-brand-700 dark:border-neutral-800 dark:bg-neutral-800/80 dark:text-neutral-400 dark:group-hover/name:border-brand-500/40 dark:group-hover/name:text-brand-300">
                      {isExpanded ? <ChevronDown size={11} className="text-brand-600 dark:text-brand-400" /> : <ChevronRight size={11} />}
                      <span>Sizes</span>
                    </span>
                  </button>
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
                      {p.info && showCompanionInfo(p) ? ` (${p.info.label}: ${p.info.onHand})` : ''}
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
            {isExpanded ? (() => {
              const info = getProductSizes(p, products);
              const selectedColor = activeColorByRow[p.id] || info.currentColor;
              const activeSizes = (selectedColor && selectedColor !== info.currentColor
                ? info.otherColors.find((c) => c.color === selectedColor)?.sizes
                : info.colorSizes) || info.colorSizes;
              const allColors = [
                ...(info.currentColor ? [{ color: info.currentColor, isCurrent: true, count: info.colorSizes.length }] : []),
                ...info.otherColors.map((c) => ({ color: c.color, isCurrent: false, count: c.sizes.length })),
              ];

              return (
                <Tr className={`${bandCls} ${isGroupEnd ? 'border-b-2 border-brand-600/30' : ''} bg-neutral-50/80 dark:bg-neutral-900/60`}>
                  <Td colSpan={8} className={`${accentCls} p-0`}>
                    <div className="border-t border-b border-black/10 dark:border-white/10 px-4 py-3 sm:px-6">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400">
                            <Package size={13} />
                          </span>
                          <div>
                            <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                              Stock by Size: <span className="text-brand-600 dark:text-brand-400">{info.styleName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                              {info.groupCode ? <span className="font-mono">Style: {info.groupCode}</span> : null}
                              {p.category ? <span>· {p.category}</span> : null}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleExpand(p.id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10 transition"
                          title="Close size stock view"
                        >
                          <X size={12} />
                          <span>Close</span>
                        </button>
                      </div>

                      {allColors.length > 1 ? (
                        <div className="flex items-center gap-1.5 pt-2.5 pb-1 overflow-x-auto">
                          <span className="text-[11px] font-medium text-neutral-500 shrink-0 mr-1">Colour:</span>
                          {allColors.map((c) => {
                            const isActive = (selectedColor || info.currentColor) === c.color;
                            return (
                              <button
                                key={c.color}
                                type="button"
                                onClick={() => setActiveColorByRow((prev) => ({ ...prev, [p.id]: c.color }))}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                                  isActive
                                    ? 'border border-brand-600 bg-brand-600 text-white shadow-sm'
                                    : 'border border-black/10 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                                }`}
                              >
                                <span
                                  className="size-2.5 rounded-full border border-black/20 dark:border-white/20 shrink-0"
                                  style={{ background: swatch(c.color) }}
                                />
                                <span>{c.color}</span>
                                {c.isCurrent ? <span className="text-[10px] opacity-75">(this order)</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="pt-2.5">
                        {activeSizes.length === 0 ? (
                          <p className="text-xs text-neutral-400 py-1">No sizes found for this product in catalog.</p>
                        ) : (
                          <div className="flex flex-wrap items-stretch gap-2">
                            {activeSizes.map((sz) => {
                              const isShort = sz.available <= 0;
                              const isLow = sz.available > 0 && sz.available <= 5;
                              const isCurrentSize = sz.isCurrent;

                              return (
                                <div
                                  key={sz.sku}
                                  className={`relative flex min-w-[5.5rem] flex-col justify-between rounded-xl p-2.5 transition shadow-xs ${
                                    isCurrentSize
                                      ? 'border-2 border-brand-500 bg-brand-50/80 ring-2 ring-brand-500/20 dark:border-brand-400 dark:bg-neutral-800 dark:ring-2 dark:ring-brand-500/60 dark:shadow-[0_0_14px_rgba(168,70,92,0.35)]'
                                      : 'border border-black/10 bg-white dark:border-white/10 dark:bg-neutral-800'
                                  }`}
                                >
                                  {isCurrentSize ? (
                                    <span className="absolute -top-2.5 right-2 rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm ring-1 ring-white/20 dark:bg-brand-500">
                                      Ordered
                                    </span>
                                  ) : null}

                                  <div className="flex items-baseline justify-between gap-1.5">
                                    <span className="text-sm font-bold text-neutral-900 dark:text-white">
                                      {sz.sizeLabel}
                                    </span>
                                    <span
                                      className={`text-xs font-bold tabular-nums ${
                                        isShort ? 'text-red-500 dark:text-red-400' : isLow ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                                      }`}
                                    >
                                      {sz.available}
                                    </span>
                                  </div>

                                  <div className="mt-1 flex flex-col gap-0.5 text-[10px]">
                                    <span
                                      className={`font-semibold ${
                                        isShort ? 'text-red-600 dark:text-red-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                                      }`}
                                    >
                                      {isShort ? 'Out of stock' : isLow ? 'Low stock' : 'Available'}
                                    </span>
                                    <span className="text-neutral-500 dark:text-neutral-300 font-medium">
                                      {sz.onHand} on hand
                                    </span>
                                    <span className="font-mono text-[9px] text-neutral-400 dark:text-neutral-400 truncate max-w-[7.5rem]" title={sz.sku}>
                                      {sz.sku}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </Td>
                </Tr>
              );
            })() : null}
            </Fragment>
          );
        })}
      </Table>
    </Panel>
  );
}
