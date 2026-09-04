'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
import { SearchableSelect } from '@/components/SearchableSelect';
import { ProductPicker } from '@/components/ProductPicker';
import { useToast } from '@/components/ToastProvider';
import { useConfirm } from '@/components/ConfirmProvider';
import { dateOnly, dayKey } from '@/lib/format';
import type { VariantMeta } from '@/lib/variants';

interface P extends VariantMeta { sku: string; name: string; onHand: number; available: number }
interface Use { where: 'QUEUE' | 'SHIPPED'; sku: string; name: string; qty: number; at: string | null }

const input = 'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// A bare YYYY-MM-DD from the date input means "ships by end of that day" —
// convert to the actual IST end-of-day instant, matching how ship-by dates
// are computed everywhere else in this system (myntra/amazon poll logic).
function istEndOfDayIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS).toISOString();
}

function tomorrowIst(): string {
  return dayKey(new Date(Date.now() + 86400_000));
}

export function AddPendingForm({ products }: { products: P[] }) {
  const router = useRouter();
  const toast = useToast();
  const ask = useConfirm();
  const [sku, setSku] = useState(products[0]?.sku ?? '');
  const [qty, setQty] = useState('1');
  const [channel, setChannel] = useState<Platform>('AMAZON');
  const [orderId, setOrderId] = useState('');
  const [shipByAt, setShipByAt] = useState(tomorrowIst);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  const sel = products.find((p) => p.sku === sku);
  const avail = sel?.available ?? 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Warn if this order number is already queued or has already shipped — one
    // order can legitimately hold two different products, so it's not a block.
    let dupes: Use[] = [];
    if (orderId.trim()) {
      setChecking(true);
      try {
        const res = await fetch(`/api/pending/check?orderId=${encodeURIComponent(orderId.trim())}`);
        const data = await res.json().catch(() => ({}));
        dupes = Array.isArray(data?.uses) ? data.uses : [];
      } catch {
        // A failed check shouldn't stop the order being added.
      } finally {
        setChecking(false);
      }
    }
    const sameProduct = dupes.filter((d) => d.sku === sku);

    // Confirm the platform before adding — easy to leave it on the wrong one.
    const ok = await ask({
      title: dupes.length ? 'This order number is already used' : 'Add to Ready to Ship?',
      description: dupes.length
        ? sameProduct.length
          ? `Order ${orderId.trim()} already has this exact product ${sameProduct[0].where === 'SHIPPED' ? 'shipped' : 'in the queue'}. Adding it again may ship a duplicate.`
          : `Order ${orderId.trim()} is already used for another product. That's fine if the order has more than one item.`
        : 'Double-check the platform is correct before adding.',
      tone: sameProduct.length ? 'danger' : 'default',
      details: [
        { label: 'Product', value: sel?.name ?? sku },
        { label: 'SKU', value: sku },
        { label: 'Platform', value: PLATFORM_LABELS[channel] },
        { label: 'Qty', value: qty },
        ...(orderId.trim() ? [{ label: 'Order no.', value: orderId.trim() }] : []),
        ...(shipByAt ? [{ label: 'Ship by', value: dateOnly(shipByAt) }] : []),
        ...dupes.map((d) => ({
          label: d.where === 'SHIPPED' ? 'Already shipped' : 'Already queued',
          value: `${d.qty} × ${d.name}${d.at ? ` on ${dateOnly(d.at)}` : ''}`,
        })),
      ],
      confirmLabel: dupes.length ? 'Add anyway' : 'Add',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch('/api/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          qty: Number(qty),
          channel,
          orderId: orderId.trim() || undefined,
          shipByAt: shipByAt ? istEndOfDayIso(shipByAt) : undefined,
        }),
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
      <div className="grid gap-4 sm:grid-cols-[2fr_auto_auto_auto_auto_auto] sm:items-end">
        {/* Product · Qty · Platform · Order no. · Ship by · Add */}
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
          Order no. <span className="text-[10px] text-neutral-400">optional</span>
          <input className={`${input} w-36`} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="405-123…" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Ship by
          <input className={input} type="date" value={shipByAt} onChange={(e) => setShipByAt(e.target.value)} />
        </label>
        <button
          disabled={busy || checking || !sku || !qty}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus size={15} /> {checking ? 'Checking…' : busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      {avail <= 0 && sku ? (
        <p className="mt-2 text-xs text-amber-600">Heads-up: nothing available for this size — you may need to produce it.</p>
      ) : null}

      <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
        {/* Chips show AVAILABLE (on-hand − reserved), matching the number above the search box. */}
        <ProductPicker
          products={products.map((p) => ({ ...p, inStock: p.available }))}
          value={sku}
          onChange={setSku}
        />
      </div>
    </form>
  );
}
