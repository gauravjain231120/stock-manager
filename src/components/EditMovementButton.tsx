'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PLATFORMS,
  PLATFORM_LABELS,
  Platform,
  MAX_TRACKING_LEN,
  normalizeTracking,
  RETURN_CONDITIONS,
  RETURN_CONDITION_LABELS,
  RETURN_CONDITION_HINTS,
  ReturnCondition,
} from '@/lib/constants';
import { useToast } from '@/components/ToastProvider';
import type { MovementRow } from '@/lib/movements';

const input = 'w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

/** Fix a shipment or return after the fact — tracking, order number, platform, quantity, date, or (returns only) condition. */
export function EditMovementButton({ row, title }: { row: MovementRow; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isReturn = title === 'return';

  const [tracking, setTracking] = useState(row.trackingId ?? '');
  const [orderId, setOrderId] = useState(row.orderId ?? '');
  const [channel, setChannel] = useState<Platform>((row.channel as Platform) ?? 'AMAZON');
  const [qty, setQty] = useState(String(row.qty));
  const [date, setDate] = useState(row.at.slice(0, 10));
  const [condition, setCondition] = useState<ReturnCondition>((row.condition as ReturnCondition) ?? 'GOOD');

  const trackingLen = (normalizeTracking(tracking) ?? '').length;
  const trackingTooLong = trackingLen > MAX_TRACKING_LEN;

  function start() {
    setTracking(row.trackingId ?? '');
    setOrderId(row.orderId ?? '');
    setChannel((row.channel as Platform) ?? 'AMAZON');
    setQty(String(row.qty));
    setDate(row.at.slice(0, 10));
    setCondition((row.condition as ReturnCondition) ?? 'GOOD');
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (trackingTooLong) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/register/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingId: tracking,
          orderId,
          channel,
          qty: Number(qty),
          date,
          ...(isReturn ? { condition } : {}),
        }),
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
            <h3 className="text-base font-semibold">Edit {title}</h3>
            <div className="mt-2 text-sm">
              <div className="font-medium">
                {row.name}
                {row.color ? ` — ${row.color}` : ''}
                {row.size ? <span className="text-neutral-500"> · {row.size}</span> : null}
              </div>
              <div className="font-mono text-xs text-neutral-500">{row.sku}</div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                <span className="flex items-center justify-between">
                  <span>Tracking / AWB</span>
                  <span className={trackingTooLong ? 'text-red-500' : 'text-neutral-400'}>{trackingLen}/{MAX_TRACKING_LEN}</span>
                </span>
                <input className={`${input} font-mono`} value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="empty" />
                {trackingTooLong ? (
                  <span className="text-red-500">Too long — a tracking number can be at most {MAX_TRACKING_LEN} characters.</span>
                ) : null}
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                Order no.
                <input className={`${input} font-mono`} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="empty" />
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
                Date
                <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              {isReturn ? (
                <div className="flex flex-col gap-1 text-xs text-neutral-500">
                  What came back?
                  <div className="mt-0.5 flex flex-col gap-1.5">
                    {RETURN_CONDITIONS.map((k) => (
                      <button
                        type="button"
                        key={k}
                        onClick={() => setCondition(k)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          condition === k
                            ? k === 'GOOD' ? 'bg-emerald-600 text-white' : k === 'USED' ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'
                            : 'border border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10'
                        }`}
                      >
                        {RETURN_CONDITION_LABELS[k]}
                        <span className={`ml-auto text-xs font-normal ${condition === k ? 'opacity-80' : 'text-neutral-400'}`}>
                          {RETURN_CONDITION_HINTS[k]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <p className="mt-3 text-[11px] text-neutral-400">
              Changing the quantity adjusts stock to match.
              {isReturn ? ' Changing condition across the Wrong-item line moves the stock between shelves too.' : ''}
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                Cancel
              </button>
              <button disabled={busy || trackingTooLong} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
