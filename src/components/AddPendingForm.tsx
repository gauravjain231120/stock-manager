'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
import { SearchableSelect } from '@/components/SearchableSelect';
import { useToast } from '@/components/ToastProvider';

interface P { sku: string; name: string; onHand: number; available: number }

const input = 'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

export function AddPendingForm({ products }: { products: P[] }) {
  const router = useRouter();
  const toast = useToast();
  const [sku, setSku] = useState(products[0]?.sku ?? '');
  const [qty, setQty] = useState('1');
  const [channel, setChannel] = useState<Platform>('AMAZON');
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);

  const sel = products.find((p) => p.sku === sku);
  const avail = sel?.available ?? 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, qty: Number(qty), channel, orderId: orderId.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Failed to add');
      else {
        toast.success('Added to Ready to Ship ✓');
        setQty('1');
        setOrderId('');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="grid gap-4 sm:grid-cols-[2fr_auto_auto_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          <span className="flex items-center justify-between">
            <span>Product</span>
            {sku ? (
              <span>
                Available: <b className={avail <= 0 ? 'text-red-600' : avail <= 5 ? 'text-amber-600' : 'text-emerald-600'}>{avail}</b>
              </span>
            ) : null}
          </span>
          <SearchableSelect
            options={products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` }))}
            value={sku}
            onChange={setSku}
            placeholder="Search product or SKU…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Qty
          <input className={`${input} w-20`} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Platform
          <select className={input} value={channel} onChange={(e) => setChannel(e.target.value as Platform)}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Order ID <span className="text-neutral-400">(optional)</span>
          <input className={input} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="403-…" />
        </label>
        <button
          disabled={busy || !sku || !qty}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus size={15} /> {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      {avail <= 0 && sku ? (
        <p className="mt-2 text-xs text-amber-600">Heads-up: nothing available for this size — you may need to produce it.</p>
      ) : null}
    </form>
  );
}
