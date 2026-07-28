'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Truck, Undo2, ScanLine } from 'lucide-react';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
import { SearchableSelect } from '@/components/SearchableSelect';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';

function todayStr() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD (local)
}

function qtyColor(n: number) {
  if (n <= 0) return 'text-red-600';
  if (n <= 5) return 'text-amber-600';
  return 'text-emerald-600';
}

const ACTIONS = [
  { key: 'PRODUCE', label: 'Produce', help: 'made new units (+)', tone: 'bg-emerald-600', Icon: Plus },
  { key: 'SHIP', label: 'Ship', help: 'sent to customer (−)', tone: 'bg-blue-600', Icon: Truck },
  { key: 'RETURN', label: 'Return', help: 'came back (+)', tone: 'bg-amber-600', Icon: Undo2 },
] as const;

const input = 'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

export function RegisterEntryForm({ products }: { products: { sku: string; name: string; inStock?: number }[] }) {
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [sku, setSku] = useState(products[0]?.sku ?? '');
  const [action, setAction] = useState<(typeof ACTIONS)[number]['key']>('PRODUCE');
  const [channel, setChannel] = useState<Platform>('AMAZON');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tracking, setTracking] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  // Default the date to today on the client (after mount, to avoid an SSR
  // hydration mismatch since the server doesn't know the user's timezone).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDate(todayStr()), []);

  const needsPlatform = action === 'SHIP' || action === 'RETURN';
  const selectedStock = products.find((p) => p.sku === sku)?.inStock ?? 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Returns come back with a courier label — ask for it (scannable) instead of
    // the plain confirm box, so the tracking number is captured at the same time.
    if (action === 'RETURN') {
      setTracking('');
      setScanOpen(true);
      return;
    }

    const actionLabel = ACTIONS.find((a) => a.key === action)?.label ?? action;
    const productName = products.find((p) => p.sku === sku)?.name;
    const ok = await ask({
      title: `Confirm ${actionLabel}`,
      details: [
        { label: 'Product', value: productName ? `${sku} — ${productName}` : sku },
        { label: 'Action', value: actionLabel },
        { label: 'Quantity', value: qty || '0' },
        ...(needsPlatform ? [{ label: 'Platform', value: PLATFORM_LABELS[channel] }] : []),
        { label: 'Date', value: date && date !== todayStr() ? date : 'Today' },
      ],
      confirmLabel: actionLabel,
    });
    if (!ok) return;

    await save();
  }

  async function save() {
    const actionLabel = ACTIONS.find((a) => a.key === action)?.label ?? action;
    setBusy(true);
    setErr(null);
    try {
      const today = todayStr();
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only send a date when it's a PAST date; for today, omit it so the real
        // time-of-day is kept.
        body: JSON.stringify({
          sku,
          action,
          qty: Number(qty),
          channel: needsPlatform ? channel : undefined,
          date: date && date !== today ? date : undefined,
          trackingId: tracking.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const raw = data?.error || `Error ${res.status}`;
        setErr(/insufficient stock|not enough stock/i.test(raw) ? `Not enough stock to ship ${qty}.` : raw);
      } else {
        toast.success(`${actionLabel} saved ✓`);
        setQty('');
        setTracking('');
        setScanOpen(false);
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      {err ? (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          ⚠ {err}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          <span className="flex items-center justify-between">
            <span>Product</span>
            {sku ? (
              <span>In stock: <b className={qtyColor(selectedStock)}>{selectedStock}</b></span>
            ) : null}
          </span>
          <SearchableSelect
            options={products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` }))}
            value={sku}
            onChange={setSku}
            placeholder="Search product…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Quantity
          <input className={input} type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" required />
        </label>
        <button className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={busy || !qty || !sku}>
          {busy ? 'Saving…' : 'Add'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ACTIONS.map((a) => (
          <button
            type="button"
            key={a.key}
            onClick={() => setAction(a.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              action === a.key ? `${a.tone} text-white shadow-sm` : 'border border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10'
            }`}
            title={a.help}
          >
            <a.Icon size={15} />
            {a.label}
          </button>
        ))}

        {needsPlatform ? (
          <label className="ml-1 flex items-center gap-2 text-xs text-neutral-500">
            Platform
            <select className={input} value={channel} onChange={(e) => setChannel(e.target.value as Platform)}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="self-center text-xs text-neutral-400">{ACTIONS.find((a) => a.key === action)?.help}</span>
        )}

        <label className="ml-1 flex items-center gap-2 text-xs text-neutral-500">
          Date
          <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {scanOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setScanOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 text-left shadow-xl dark:border-white/10 dark:bg-neutral-900">
            <h3 className="text-base font-semibold">Return — scan the label</h3>

            <div className="mt-3 rounded-lg bg-black/5 p-3 dark:bg-white/5">
              <div className="font-medium">{products.find((p) => p.sku === sku)?.name ?? sku}</div>
              <div className="font-mono text-xs text-neutral-500">{sku}</div>
              <div className="mt-1 text-xs text-neutral-500">
                {PLATFORM_LABELS[channel]} · {qty || 0} unit{Number(qty) === 1 ? '' : 's'} · {date && date !== todayStr() ? date : 'today'}
              </div>
            </div>

            <label className="mt-4 flex flex-col gap-1 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5"><ScanLine size={13} /> Tracking / AWB <span className="text-neutral-400">(optional)</span></span>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                autoFocus
                placeholder="Scan or type the number…"
                className="rounded-lg border border-black/15 bg-transparent px-3 py-2.5 font-mono text-sm text-neutral-900 dark:border-white/20 dark:text-white"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setScanOpen(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save return'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
