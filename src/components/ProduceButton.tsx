'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

/**
 * Make more of a queued item without leaving the ship queue. Records the same
 * PRODUCE entry the Stock Log would, so the units land in MAIN and the row
 * becomes shippable straight away.
 *
 * Units are made against `stockSku`, not `sku`: a bundle set ships another SKU's
 * physical garment, and that's the pile you actually have to sew.
 */
export function ProduceButton({
  sku,
  stockSku,
  name,
  onHand,
  need,
}: {
  sku: string;
  /** The SKU whose physical stock this row ships (differs for bundle sets). */
  stockSku: string;
  name: string;
  onHand: number;
  /** Units this row needs, so the box opens on "just enough to ship it". */
  need: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const short = Math.max(1, need - onHand);
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(short);
  const [busy, setBusy] = useState(false);

  const clamp = (v: number) => Math.max(1, Math.min(v, 9999));

  async function produce() {
    const qty = clamp(n);
    setBusy(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: stockSku, action: 'PRODUCE', qty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Could not add stock');
      else {
        toast.success(`Made ${qty} ✓`);
        setOpen(false);
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add stock');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setN(short); setOpen(true); }}
        title={onHand < need ? `Short ${need - onHand} — make more` : 'Add stock for this product'}
        className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Produce
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-xl border border-black/10 bg-white p-5 text-left shadow-xl dark:border-white/10 dark:bg-neutral-900">
            <h3 className="text-base font-semibold">Make how many?</h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{name}</p>
            <p className="font-mono text-xs text-neutral-400">{stockSku}</p>
            {stockSku !== sku ? (
              <p className="mt-1 text-[11px] text-amber-500">This set ships the {stockSku} garment — that&apos;s what gets made.</p>
            ) : null}

            <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
              <span>In stock now</span>
              <span className={`font-semibold ${onHand <= 0 ? 'text-red-600' : onHand <= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>{onHand}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
              <span>This order needs</span>
              <span className="font-semibold">{need}</span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button type="button" onClick={() => setN((v) => clamp(v - 1))} className="rounded-lg border border-black/15 p-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"><Minus size={16} /></button>
              <input
                autoFocus
                type="number"
                min={1}
                value={n}
                onChange={(e) => setN(clamp(Number(e.target.value) || 1))}
                onKeyDown={(e) => { if (e.key === 'Enter') produce(); }}
                className="w-20 rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-center text-sm text-neutral-900 dark:border-white/20 dark:text-white"
              />
              <button type="button" onClick={() => setN((v) => clamp(v + 1))} className="rounded-lg border border-black/15 p-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"><Plus size={16} /></button>
              <span className="text-xs text-neutral-400">→ {onHand + clamp(n)} in stock</span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">Cancel</button>
              <button onClick={produce} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? 'Adding…' : `Make ${clamp(n)}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
