'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORMS, PLATFORM_LABELS, Platform, MAX_TRACKING_LEN, normalizeTracking } from '@/lib/constants';
import { SearchableSelect } from '@/components/SearchableSelect';
import { useToast } from '@/components/ToastProvider';

const input = 'w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

/** Fix a queued order before it ships — product, platform, quantity or order number. */
export function EditPendingButton({
  row,
  products,
  open: openProp,
  onOpenChange,
  hideTrigger,
}: {
  row: { id: string; sku: string; qty: number; channel: string | null; orderId: string | null; trackingId: string | null };
  products: { sku: string; name: string }[];
  /** Drive the dialog from a parent (so it can be opened from a menu that closes). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [openSelf, setOpenSelf] = useState(false);
  const open = openProp ?? openSelf;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOpenSelf(v));
  const [busy, setBusy] = useState(false);

  const [sku, setSku] = useState(row.sku);
  const [channel, setChannel] = useState<Platform>((row.channel as Platform) ?? 'AMAZON');
  const [qty, setQty] = useState(String(row.qty));
  const [orderId, setOrderId] = useState(row.orderId ?? '');
  const [tracking, setTracking] = useState(row.trackingId ?? '');

  const trackingLen = (normalizeTracking(tracking) ?? '').length;
  const trackingTooLong = trackingLen > MAX_TRACKING_LEN;

  function start() {
    setSku(row.sku);
    setChannel((row.channel as Platform) ?? 'AMAZON');
    setQty(String(row.qty));
    setOrderId(row.orderId ?? '');
    setTracking(row.trackingId ?? '');
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (trackingTooLong) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pending/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, channel, qty: Number(qty), orderId, trackingId: tracking }),
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
      {hideTrigger ? null : (
        <button
          onClick={start}
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Edit
        </button>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 text-left shadow-xl dark:border-white/10 dark:bg-neutral-900"
          >
            <h3 className="text-base font-semibold">Edit queued order</h3>
            <p className="mt-1 text-xs text-neutral-500">Nothing has shipped yet — the reserved stock follows your change.</p>

            <div className="mt-4 flex flex-col gap-3">
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
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Order no.
                <input className={input} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="optional" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                <span className="flex items-center justify-between">
                  <span>Tracking / AWB</span>
                  {trackingLen > 0 ? <span className={trackingTooLong ? 'text-red-500' : 'text-neutral-400'}>{trackingLen}/{MAX_TRACKING_LEN}</span> : null}
                </span>
                <input
                  className={`${input} font-mono`}
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="scan or type — optional"
                />
                {trackingTooLong ? (
                  <span className="text-red-500">Too long — at most {MAX_TRACKING_LEN} characters.</span>
                ) : null}
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                Cancel
              </button>
              <button disabled={busy || !sku || trackingTooLong} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
