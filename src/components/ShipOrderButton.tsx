'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Package } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { MAX_TRACKING_LEN, normalizeTracking } from '@/lib/constants';

interface Item { sku: string; name: string; qty: number; onHand: number }

/**
 * Ship every line of one order together — one parcel, one tracking number.
 * Shown when a marketplace order holds more than one product.
 */
export function ShipOrderButton({
  orderId,
  items,
  trackingId,
}: {
  orderId: string;
  items: Item[];
  /** Already saved on one of the rows — pre-filled so packing is just "hit Ship". */
  trackingId?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState(trackingId ?? '');
  const [busy, setBusy] = useState(false);

  const units = items.reduce((a, i) => a + i.qty, 0);
  const short = items.filter((i) => i.onHand < i.qty);
  const trackingLen = (normalizeTracking(tracking) ?? '').length;
  const trackingTooLong = trackingLen > MAX_TRACKING_LEN;

  async function ship() {
    if (trackingTooLong) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pending/ship-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, trackingId: tracking.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Failed to ship');
      else {
        toast.success(`Shipped ${data.units} unit${data.units === 1 ? '' : 's'} in ${data.shipped} item${data.shipped === 1 ? '' : 's'} ✓`);
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
        onClick={() => { setTracking(trackingId ?? ''); setOpen(true); }}
        disabled={short.length > 0}
        title={short.length > 0 ? 'Some items in this order are out of stock' : undefined}
        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Package size={14} /> Ship whole order
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 text-left shadow-xl dark:border-white/10 dark:bg-neutral-900">
            <h3 className="text-base font-semibold">Ship the whole order</h3>
            <p className="mt-1 font-mono text-xs text-neutral-500">Order {orderId}</p>

            <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-black/5 p-3 text-sm dark:bg-white/5">
              {items.map((i) => (
                <li key={i.sku} className="flex items-baseline gap-2">
                  <span className="font-medium">{i.qty} ×</span>
                  <span className="flex-1">{i.name}</span>
                  <span className="font-mono text-[11px] text-neutral-400">{i.sku}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-neutral-500">{units} unit{units === 1 ? '' : 's'} in one parcel</p>

            <label className="mt-4 flex flex-col gap-1 text-xs text-neutral-500">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ScanLine size={13} />
                  {trackingId ? 'Tracking (already saved — check and ship)' : 'Scan the shipping label'}
                </span>
                {trackingLen > 0 ? <span className={trackingTooLong ? 'text-red-500' : 'text-neutral-400'}>{trackingLen}/{MAX_TRACKING_LEN}</span> : null}
              </span>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ship(); } }}
                autoFocus
                placeholder="Tracking / AWB…"
                className={`rounded-lg border bg-transparent px-3 py-2 font-mono text-sm text-neutral-900 dark:text-white ${
                  trackingTooLong ? 'border-red-500' : 'border-black/15 dark:border-white/20'
                }`}
              />
              {trackingTooLong ? (
                <span className="text-red-500">Too long — at most {MAX_TRACKING_LEN} characters. Scan again.</span>
              ) : (
                <span className="text-neutral-400">The same number is saved on every item in this order.</span>
              )}
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                Cancel
              </button>
              <button onClick={ship} disabled={busy || trackingTooLong} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Shipping…' : `Ship ${units}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
