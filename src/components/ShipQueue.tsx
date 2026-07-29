'use client';

import { Fragment, useState } from 'react';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { ShipButton } from '@/components/ShipButton';
import { CancelButton } from '@/components/CancelButton';
import { EditPendingButton } from '@/components/EditPendingButton';
import { ShipOrderButton } from '@/components/ShipOrderButton';
import { PlatformFilter } from '@/components/PlatformFilter';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';

export interface QueueRow {
  id: string;
  sku: string;
  /** The SKU whose physical stock this entry ships (differs for bundle sets). */
  stockSku: string;
  name: string;
  qty: number;
  channel: string | null;
  onHand: number;
  after: number;
  /** True when this SKU's total queued units exceed stock (blocks Ship all). */
  short: boolean;
  /** Companion stock shown for reference next to bundles (never deducted). */
  info: { sku: string; label: string; onHand: number } | null;
  orderId: string | null;
  trackingId: string | null;
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

  // Rows that can be ticked: enough stock to ship the entry in full.
  const selectable = rows.filter((r) => r.onHand >= r.qty && r.qty > 0);
  const sel = rows.filter((r) => selected.has(r.id));
  const selUnits = sel.reduce((a, r) => a + r.qty, 0);
  // The same physical pool picked on several rows (same SKU on two platforms, or
  // a bundle + its component) can still overrun stock — check per-pool sums.
  const selBySku = new Map<string, { qty: number; onHand: number }>();
  for (const r of sel) {
    const e = selBySku.get(r.stockSku) ?? { qty: 0, onHand: r.onHand };
    e.qty += r.qty;
    selBySku.set(r.stockSku, e);
  }
  const selShort = [...selBySku.values()].some((e) => e.qty > e.onHand);

  // Lines of the same order ship as one parcel, so keep them together and give
  // multi-item orders a header with a single "ship it all" action.
  const orderCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.orderId) orderCounts.set(r.orderId, (orderCounts.get(r.orderId) ?? 0) + 1);
  }
  const multiOrders = new Set([...orderCounts.entries()].filter(([, n]) => n > 1).map(([o]) => o));
  const ordered = [...rows].sort((a, b) => {
    const ao = a.orderId && multiOrders.has(a.orderId) ? a.orderId : '';
    const bo = b.orderId && multiOrders.has(b.orderId) ? b.orderId : '';
    if (ao !== bo) return ao && bo ? ao.localeCompare(bo) : ao ? -1 : 1;
    return 0;
  });

  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const shownUnits = rows.reduce((a, r) => a + r.qty, 0);
  const shownShort = rows.some((r) => r.short);

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
      title={`Queue (${platform ? `${rows.length} of ${totalCount}` : totalCount})`}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PlatformFilter />
          {rows.length > 0 ? (
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
                label={platform ? `Ship all ${PLATFORM_LABELS[platform]}` : 'Ship all'}
                endpoint="/api/pending/ship-all"
                method="POST"
                body={platform ? { channel: platform } : undefined}
                variant="primary"
                confirmTitle="Ship everything?"
                confirm={`All ${rows.length} item(s)${platform ? ` on ${PLATFORM_LABELS[platform]}` : ''} will be marked shipped and their stock deducted.`}
                confirmDetails={[{ label: 'Items', value: String(rows.length) }, { label: 'Units', value: String(shownUnits) }]}
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
        empty={rows.length === 0}
      >
        {ordered.map((p, i) => {
          const s = stockStatus(p.onHand);
          const canSelect = p.onHand >= p.qty && p.qty > 0;
          // First line of a multi-item order gets the "ship it all together" header.
          const grouped = p.orderId && multiOrders.has(p.orderId);
          const isGroupStart = grouped && (i === 0 || ordered[i - 1].orderId !== p.orderId);
          const groupRows = grouped ? ordered.filter((r) => r.orderId === p.orderId) : [];
          return (
            <Fragment key={p.id}>
            {isGroupStart ? (
              <Tr>
                <Td colSpan={8}>
                  <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-50 px-3 py-2 dark:bg-white/5">
                    <span className="text-sm font-medium">Order {p.orderId}</span>
                    <span className="text-xs text-neutral-500">
                      {groupRows.length} items · {groupRows.reduce((a, r) => a + r.qty, 0)} units — one parcel
                    </span>
                    <span className="ml-auto">
                      <ShipOrderButton
                        orderId={p.orderId!}
                        items={groupRows.map((r) => ({ sku: r.sku, name: r.name, qty: r.qty, onHand: r.onHand }))}
                        trackingId={groupRows.find((r) => r.trackingId)?.trackingId ?? null}
                      />
                    </span>
                  </div>
                </Td>
              </Tr>
            ) : null}
            <Tr>
              <Td>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={!canSelect}
                  title={canSelect ? undefined : 'Not enough stock to ship this entry in full'}
                  aria-label={`Select ${p.sku}`}
                  className={checkboxCls}
                />
              </Td>
              <Td>
                <div>{p.name}</div>
                <div className="font-mono text-[11px] text-neutral-400">{p.sku}</div>
                {p.orderId ? <div className="text-[11px] text-neutral-400">Order {p.orderId}</div> : null}
                {p.trackingId ? <div className="font-mono text-[11px] text-emerald-600">#{p.trackingId}</div> : null}
                {p.stockSku !== p.sku ? (
                  <div className="text-[11px] text-amber-500">
                    set — ships 1 Halter top ({p.stockSku})
                    {p.info ? ` (${p.info.label}: ${p.info.onHand})` : ''}
                  </div>
                ) : null}
              </Td>
              <Td>{platformLabel(p.channel)}</Td>
              <Td right><span className={`font-semibold ${s.color}`}>{p.onHand}</span></Td>
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
                <span className="inline-flex gap-2">
                  <ShipButton id={p.id} name={p.name} sku={p.sku} qty={p.qty} stock={p.onHand} orderId={p.orderId} trackingId={p.trackingId} />
                  <EditPendingButton row={p} products={products} />
                  <CancelButton id={p.id} name={p.name} sku={p.sku} qty={p.qty} />
                </span>
              </Td>
            </Tr>
            </Fragment>
          );
        })}
      </Table>
    </Panel>
  );
}
