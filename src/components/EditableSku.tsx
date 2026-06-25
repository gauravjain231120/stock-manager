'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';

/** Click-to-edit a variant's SKU. Saving carries its stock + history to the new code. */
export function EditableSku({ code, sku }: { code: string; sku: string }) {
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(sku);
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = val.trim().toUpperCase();
    if (!n || n === sku) {
      setEditing(false);
      return;
    }
    const ok = await ask({
      title: 'Change SKU?',
      description: 'Its stock and history move to the new SKU.',
      details: [
        { label: 'From', value: sku },
        { label: 'To', value: n },
      ],
      confirmLabel: 'Change SKU',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${code}/variant`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, newSku: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Failed to rename SKU');
      } else {
        toast.success('SKU updated ✓');
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
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-44 rounded-lg border border-black/15 bg-transparent px-2 py-1 font-mono text-xs text-neutral-900 dark:border-white/20 dark:text-white"
        />
        <button onClick={save} disabled={busy} className="px-1 text-emerald-600 disabled:opacity-50" title="Save">✓</button>
        <button onClick={() => { setVal(sku); setEditing(false); }} className="px-1 text-neutral-400" title="Cancel">✕</button>
      </span>
    );
  }

  return (
    <button
      onClick={() => { setVal(sku); setEditing(true); }}
      className="font-mono text-xs text-neutral-500 hover:text-brand-700 hover:underline dark:text-neutral-400"
      title="Click to edit SKU"
    >
      {sku} <span className="text-[10px] text-neutral-400">✎</span>
    </button>
  );
}
