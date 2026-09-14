'use client';

import { FormEvent, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Panel, StatCard, Table, Th, Td, Tr } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';
import { inr, num, dateOnly, dayKey, matchesSearch } from '@/lib/format';
import type { ClothPurchaseItem } from '@/lib/clothPurchases';

const input =
  'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';
const cellInput =
  'w-full rounded-lg border border-black/15 bg-transparent px-2 py-1 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none dark:border-white/20 dark:text-white';
const iconBtn =
  'inline-flex size-7 items-center justify-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10';

interface Draft {
  name: string;
  meters: string;
  price: string;
  shop: string;
  date: string;
}

function draftOf(c: ClothPurchaseItem): Draft {
  return { name: c.name, meters: String(c.meters), price: String(c.price), shop: c.shop, date: c.date.slice(0, 10) };
}

/** Permanent running log of fabric purchases — name/meters/price/shop/date. Not tied to the expense cycles. */
export function ClothPurchasesPanel({ initialItems }: { initialItems: ClothPurchaseItem[] }) {
  const ask = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [q, setQ] = useState('');

  const [name, setName] = useState('');
  const [meters, setMeters] = useState('');
  const [price, setPrice] = useState('');
  const [shop, setShop] = useState('');
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = items.filter((c) => matchesSearch(`${c.name} ${c.shop}`, q));
  const totals = filtered.reduce((a, c) => ({ meters: a.meters + c.meters, price: a.price + c.price }), { meters: 0, price: 0 });

  async function addPurchase(e: FormEvent) {
    e.preventDefault();
    const m = Number(meters);
    const p = Number(price);
    if (!name.trim() || !Number.isFinite(m) || m <= 0 || !Number.isFinite(p) || p <= 0) return;
    setAdding(true);
    try {
      const res = await fetch('/api/account/cloth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), meters: m, price: p, shop: shop.trim(), date }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) => [data.item as ClothPurchaseItem, ...prev]);
        setName('');
        setMeters('');
        setPrice('');
        setShop('');
        toast.success('Purchase added ✓');
      } else {
        toast.error(data?.error || 'Could not add purchase');
      }
    } finally {
      setAdding(false);
    }
  }

  function startEdit(c: ClothPurchaseItem) {
    setEditingId(c.id);
    setDraft(draftOf(c));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    const m = Number(draft.meters);
    const p = Number(draft.price);
    if (!draft.name.trim() || !Number.isFinite(m) || m <= 0 || !Number.isFinite(p) || p <= 0) {
      toast.error('Enter a name, meters, and price');
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/account/cloth/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), meters: m, price: p, shop: draft.shop.trim(), date: draft.date }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, name: draft.name.trim(), meters: m, price: p, shop: draft.shop.trim(), date: new Date(draft.date).toISOString() }
              : c,
          ),
        );
        toast.success('Purchase updated ✓');
        cancelEdit();
      } else {
        toast.error('Could not save purchase');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(c: ClothPurchaseItem) {
    const ok = await ask({
      title: 'Delete this purchase?',
      description: 'This cannot be undone.',
      details: [
        { label: 'Cloth', value: c.name },
        { label: 'Meters', value: num(c.meters) },
        { label: 'Price', value: inr(c.price) },
        ...(c.shop ? [{ label: 'Shop', value: c.shop }] : []),
        { label: 'Date', value: dateOnly(c.date) },
      ],
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/account/cloth/${c.id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.id !== c.id));
        toast.success('Purchase deleted ✓');
      } else {
        toast.error('Could not delete purchase');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Cloth Purchases</h1>
        <p className="text-sm text-neutral-500">Every fabric purchase you&apos;ve logged — a running record, separate from Account expenses.</p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Purchases" value={num(filtered.length)} />
        <StatCard label="Total meters" value={num(totals.meters)} />
        <StatCard label="Total spent" value={inr(totals.price)} tone="danger" />
      </section>

      <form
        onSubmit={addPurchase}
        className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900"
      >
        <div className="grid gap-4 sm:grid-cols-[2fr_auto_auto_1fr_auto_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Cloth name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cotton Bandhej"
              className={input}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Meters
            <input
              type="number"
              min={0}
              step="0.01"
              value={meters}
              onChange={(e) => setMeters(e.target.value)}
              className={`${input} w-24`}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Price (₹)
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`${input} w-28`}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Shop <span className="text-[10px] text-neutral-400">optional</span>
            <input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="e.g. Sharma Textiles" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} required />
          </label>
          <button
            disabled={adding}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus size={15} /> {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>

      <Panel
        title={`Purchases (${filtered.length})`}
        actions={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cloth or shop…"
            className={`${input} w-56`}
          />
        }
      >
        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-neutral-400">
            {items.length === 0 ? 'No purchases logged yet.' : 'No matches.'}
          </div>
        ) : (
          <Table head={<><Th>Date</Th><Th>Cloth</Th><Th right>Meters</Th><Th right>Price</Th><Th right>Rate/m</Th><Th>Shop</Th><Th right>Action</Th></>}>
            {filtered.map((c) => {
              const editing = editingId === c.id;
              const busy = busyId === c.id;
              if (editing && draft) {
                return (
                  <Tr key={c.id}>
                    <Td>
                      <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={cellInput} />
                    </Td>
                    <Td>
                      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={cellInput} autoFocus />
                    </Td>
                    <Td right>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft.meters}
                        onChange={(e) => setDraft({ ...draft, meters: e.target.value })}
                        className={`${cellInput} text-right tabular-nums`}
                      />
                    </Td>
                    <Td right>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft.price}
                        onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                        className={`${cellInput} text-right tabular-nums`}
                      />
                    </Td>
                    <Td right className="text-neutral-400">—</Td>
                    <Td>
                      <input value={draft.shop} onChange={(e) => setDraft({ ...draft, shop: e.target.value })} className={cellInput} />
                    </Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => saveEdit(c.id)} disabled={busy} className={`${iconBtn} text-emerald-600 disabled:opacity-50`} title="Save">
                          <Check size={15} />
                        </button>
                        <button onClick={cancelEdit} disabled={busy} className={`${iconBtn} text-neutral-400`} title="Cancel">
                          <X size={15} />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                );
              }
              return (
                <Tr key={c.id}>
                  <Td>{dateOnly(c.date)}</Td>
                  <Td>{c.name}</Td>
                  <Td right>{num(c.meters)}</Td>
                  <Td right>{inr(c.price)}</Td>
                  <Td right className="text-neutral-400">{inr(c.price / c.meters)}</Td>
                  <Td>{c.shop || '—'}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => startEdit(c)} disabled={busy} className={`${iconBtn} text-neutral-500 disabled:opacity-50`} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => remove(c)} disabled={busy} className={`${iconBtn} text-red-600 disabled:opacity-50`} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </div>
  );
}
