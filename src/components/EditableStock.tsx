'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmProvider';

function color(n: number) {
  if (n <= 0) return 'text-red-600';
  if (n <= 5) return 'text-amber-600';
  return 'text-emerald-600';
}

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
          className="w-20 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-right text-sm dark:border-white/20"
        />
        <button onClick={save} disabled={busy} className="px-1 text-emerald-600 disabled:opacity-50" title="Save">✓</button>
        <button onClick={() => setEditing(false)} className="px-1 text-neutral-400" title="Cancel">✕</button>
      </span>
    );
  }

  return (
    <button
      onClick={() => {
        setVal(String(value));
        setEditing(true);
      }}
      className={`font-semibold tabular-nums hover:underline ${color(value)}`}
      title="Click to edit stock"
    >
      {value} <span className="text-[10px] text-neutral-400">✎</span>
    </button>
  );
}
