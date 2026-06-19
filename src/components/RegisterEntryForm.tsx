'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
import { SearchableSelect } from '@/components/SearchableSelect';

const ACTIONS = [
  { key: 'PRODUCE', label: 'Produce', help: 'made new units (+)', tone: 'bg-emerald-600' },
  { key: 'SHIP', label: 'Ship', help: 'sent to customer (−)', tone: 'bg-blue-600' },
  { key: 'RETURN', label: 'Return', help: 'came back (+)', tone: 'bg-amber-600' },
] as const;

const input = 'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20';

export function RegisterEntryForm({ products }: { products: { sku: string; name: string }[] }) {
  const router = useRouter();
  const [sku, setSku] = useState(products[0]?.sku ?? '');
  const [action, setAction] = useState<(typeof ACTIONS)[number]['key']>('PRODUCE');
  const [channel, setChannel] = useState<Platform>('AMAZON');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const needsPlatform = action === 'SHIP' || action === 'RETURN';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, action, qty: Number(qty), channel: needsPlatform ? channel : undefined }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data?.error || `Error ${res.status}`);
      else {
        setMsg('Saved ✓');
        setQty('');
        router.refresh();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Product
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
        <button className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-neutral-200" disabled={busy || !qty || !sku}>
          {busy ? 'Saving…' : 'Add'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ACTIONS.map((a) => (
          <button
            type="button"
            key={a.key}
            onClick={() => setAction(a.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              action === a.key ? `${a.tone} text-white` : 'border border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10'
            }`}
            title={a.help}
          >
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

        {msg ? <span className="self-center text-xs text-neutral-500">· {msg}</span> : null}
      </div>
    </form>
  );
}
