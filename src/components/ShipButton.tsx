'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

/** Ship button that opens a "how many?" picker (with confirm) before shipping. */
export function ShipButton({ id, name, sku, qty, stock }: { id: string; name: string; sku: string; qty: number; stock: number }) {
  const router = useRouter();
  const toast = useToast();
  const maxShip = Math.min(qty, stock); // can't ship more than ordered or more than in stock
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(maxShip);
  const [busy, setBusy] = useState(false);

  const clamp = (v: number) => Math.max(1, Math.min(v, maxShip));

  async function ship() {
    const sendQty = clamp(n);
    setBusy(true);
    try {
      const res = await fetch(`/api/pending/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: sendQty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Failed to ship');
      else {
        toast.success(`Shipped ${sendQty} ✓`);
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
        onClick={() => { setN(maxShip); setOpen(true); }}
        disabled={maxShip <= 0}
        title={maxShip <= 0 ? 'Out of stock — produce it first' : undefined}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Ship
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-xl border border-black/10 bg-white p-5 text-left shadow-xl dark:border-white/10 dark:bg-neutral-900">
            <h3 className="text-base font-semibold">Ship how many?</h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{name}</p>
            <p className="font-mono text-xs text-neutral-400">{sku}</p>

            <div className="mt-4 flex items-center gap-2">
              <button type="button" onClick={() => setN((v) => clamp(v - 1))} className="rounded-lg border border-black/15 p-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"><Minus size={16} /></button>
              <input
                type="number"
                min={1}
                max={maxShip}
                value={n}
                onChange={(e) => setN(clamp(Number(e.target.value) || 1))}
                className="w-20 rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-center text-sm text-neutral-900 dark:border-white/20 dark:text-white"
              />
              <button type="button" onClick={() => setN((v) => clamp(v + 1))} className="rounded-lg border border-black/15 p-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"><Plus size={16} /></button>
              <span className="text-xs text-neutral-400">of {qty} ordered · {stock} in stock</span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">Cancel</button>
              <button onClick={ship} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Shipping…' : `Ship ${clamp(n)}`}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
