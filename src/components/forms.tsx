'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const inputCls =
  'rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20';
const btnCls =
  'rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';

function useSubmit(endpoint: string, method: 'POST' | 'PUT' = 'POST') {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(body: unknown, reset?: () => void) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(data?.error || `Error ${res.status}`);
      else {
        setMsg('Saved ✓');
        reset?.();
        router.refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, msg };
}

export function CreateBatchForm({ skus }: { skus: string[] }) {
  const { submit, busy, msg } = useSubmit('/api/production');
  const [sku, setSku] = useState(skus[0] ?? '');
  const [qty, setQty] = useState('');
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit({ sku, qty: Number(qty) }, () => setQty(''));
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 p-4">
      <select className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)}>
        {skus.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className={inputCls} type="number" min={1} placeholder="Qty to produce" value={qty} onChange={(e) => setQty(e.target.value)} required />
      <button className={btnCls} disabled={busy || !qty}>Produce</button>
      {msg ? <span className="text-xs text-neutral-500">{msg}</span> : null}
    </form>
  );
}

export function ReceiveMaterialForm({ materials }: { materials: string[] }) {
  const { submit, busy, msg } = useSubmit('/api/raw-materials/receive');
  const [materialCode, setMaterialCode] = useState(materials[0] ?? '');
  const [qty, setQty] = useState('');
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit({ materialCode, qty: Number(qty) }, () => setQty(''));
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 p-4">
      <select className={inputCls} value={materialCode} onChange={(e) => setMaterialCode(e.target.value)}>
        {materials.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input className={inputCls} type="number" min={1} placeholder="Qty received" value={qty} onChange={(e) => setQty(e.target.value)} required />
      <button className={btnCls} disabled={busy || !qty}>Receive</button>
      {msg ? <span className="text-xs text-neutral-500">{msg}</span> : null}
    </form>
  );
}

export function AddListingForm({ skus, channels }: { skus: string[]; channels: string[] }) {
  const { submit, busy, msg } = useSubmit('/api/channel-listings');
  const [sku, setSku] = useState(skus[0] ?? '');
  const [channel, setChannel] = useState(channels[0] ?? '');
  const [channelSku, setChannelSku] = useState('');
  const [price, setPrice] = useState('');
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit({ sku, channel, channelSku, price: price ? Number(price) : undefined }, () => { setChannelSku(''); setPrice(''); });
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 p-4">
      <select className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)}>
        {skus.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
        {channels.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input className={inputCls} placeholder="Channel SKU / listing code" value={channelSku} onChange={(e) => setChannelSku(e.target.value)} required />
      <input className={inputCls} type="number" min={0} placeholder="Price ₹" value={price} onChange={(e) => setPrice(e.target.value)} />
      <button className={btnCls} disabled={busy || !channelSku}>Map</button>
      {msg ? <span className="text-xs text-neutral-500">{msg}</span> : null}
    </form>
  );
}
