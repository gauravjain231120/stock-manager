'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, X } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';

const iconBtn =
  'inline-flex size-6 items-center justify-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10';

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
      <span className="mt-0.5 inline-flex items-center gap-1">
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-36 rounded-lg border border-black/15 bg-transparent px-2 py-1 font-mono text-[11px] text-neutral-900 focus:border-brand-500 focus:outline-none dark:border-white/20 dark:text-white"
        />
        <button onClick={save} disabled={busy} className={`${iconBtn} text-emerald-600 disabled:opacity-50`} title="Save">
          <Check size={13} />
        </button>
        <button onClick={() => { setVal(sku); setEditing(false); }} className={`${iconBtn} text-neutral-400`} title="Cancel">
          <X size={13} />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => { setVal(sku); setEditing(true); }}
      className="group mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-neutral-400 hover:text-brand-700 dark:text-neutral-500 dark:hover:text-brand-500"
      title="Click to edit SKU"
    >
      {sku}
      <Pencil size={10} className="opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
