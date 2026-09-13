'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, X } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmProvider';

function color(n: number) {
  if (n <= 0) return 'text-red-600 dark:text-red-400';
  if (n <= 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

const iconBtn =
  'inline-flex size-6 items-center justify-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10';

/** Click-to-edit current stock number. Saving records the change as an adjustment. */
export function EditableStock({ sku, value }: { sku: string; value: number }) {
  const router = useRouter();
  const ask = useConfirm();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return;
    if (n === value) {
      setEditing(false);
      return;
    }
    const ok = await ask({
      title: 'Update stock?',
      details: [
        { label: 'Product', value: sku },
        { label: 'From', value: String(value) },
        { label: 'To', value: String(n) },
      ],
      confirmLabel: 'Update',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, onHand: n }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          type="number"
          min={0}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-16 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-right text-sm tabular-nums text-neutral-900 focus:border-brand-500 focus:outline-none dark:border-white/20 dark:text-white"
        />
        <button onClick={save} disabled={busy} className={`${iconBtn} text-emerald-600 disabled:opacity-50`} title="Save">
          <Check size={14} />
        </button>
        <button onClick={() => setEditing(false)} className={`${iconBtn} text-neutral-400`} title="Cancel">
          <X size={14} />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => {
        setVal(String(value));
        setEditing(true);
      }}
      className={`group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold tabular-nums transition hover:bg-black/5 dark:hover:bg-white/10 ${color(value)}`}
      title="Click to edit stock"
    >
      {value}
      <Pencil size={11} className="text-neutral-400 opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
