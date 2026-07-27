'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
import { SearchableSelect } from '@/components/SearchableSelect';
import { useToast } from '@/components/ToastProvider';

interface P { sku: string; name: string }

const input = 'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

/** Log a return the customer has just initiated, so the parcel can be scanned when it lands. */
export function AddReturnForm({ products }: { products: P[] }) {
  const router = useRouter();
  const toast = useToast();
  const [trackingId, setTrackingId] = useState('');
  const [sku, setSku] = useState(products[0]?.sku ?? '');
  const [channel, setChannel] = useState<Platform>('AMAZON');
  const [orderId, setOrderId] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/return-shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingId, sku, channel, orderId, qty: Number(qty) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Failed to add');
      else {
        toast.success('Return expected ✓');
        setTrackingId('');
        setOrderId('');
        setQty('1');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="grid gap-4 sm:grid-cols-[1.2fr_2fr_auto_auto_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Tracking / AWB
          <input className={`${input} font-mono`} value={trackingId} onChange={(e) => setTrackingId(e.target.value)} placeholder="77123456789" required />
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
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Platform
          <select className={input} value={channel} onChange={(e) => setChannel(e.target.value as Platform)}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Order no. <span className="text-[10px] text-neutral-400">optional</span>
          <input className={`${input} w-36`} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="405-123…" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Qty
          <input className={`${input} w-20`} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required />
        </label>
        <button
          disabled={busy || !trackingId || !sku}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus size={15} /> {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  );
}
