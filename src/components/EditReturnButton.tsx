'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
import { SearchableSelect } from '@/components/SearchableSelect';
import { useToast } from '@/components/ToastProvider';
import type { ReturnRow } from '@/lib/returnShipments';

const input = 'w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

function todayStr() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD (local)
}

/** Fix a parcel that hasn't arrived yet — tracking, product, platform, order, qty or date. */
export function EditReturnButton({ row, products }: { row: ReturnRow; products: { sku: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [trackingId, setTrackingId] = useState(row.trackingId);
  const [sku, setSku] = useState(row.sku);
  const [channel, setChannel] = useState<Platform | ''>((row.channel as Platform) ?? '');
  const [orderId, setOrderId] = useState(row.orderId ?? '');
  const [qty, setQty] = useState(String(row.qty));
  const [date, setDate] = useState(row.initiatedAt.slice(0, 10));

  function start() {
    setTrackingId(row.trackingId);
    setSku(row.sku);
    setChannel((row.channel as Platform) ?? '');
    setOrderId(row.orderId ?? '');
    setQty(String(row.qty));
    setDate(row.initiatedAt.slice(0, 10));
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/return-shipments/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingId, sku, channel, orderId, qty: Number(qty), date }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Failed to save');
      else {
        toast.success('Saved ✓');
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={start}
        className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Edit
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 text-left shadow-xl dark:border-white/10 dark:bg-neutral-900"
          >
            <h3 className="text-base font-semibold">Edit return</h3>
            <p className="mt-1 text-xs text-neutral-500">This parcel hasn’t arrived yet, so nothing here affects stock.</p>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Tracking / AWB
                <input className={`${input} font-mono`} value={trackingId} onChange={(e) => setTrackingId(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Product
                <SearchableSelect
                  options={products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` }))}
                  value={sku}
                  onChange={setSku}
                  placeholder="Search product or SKU…"
                />
              </label>
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-500">
                  Platform
                  <select className={input} value={channel} onChange={(e) => setChannel(e.target.value as Platform)}>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                  </select>
                </label>
                <label className="flex w-24 flex-col gap-1 text-xs text-neutral-500">
                  Qty
                  <input className={input} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required />
                </label>
              </div>
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-500">
                  Order no.
                  <input className={input} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="optional" />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-500">
                  Return started
                  <input className={input} type="date" max={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                Cancel
              </button>
              <button disabled={busy || !trackingId || !sku} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
