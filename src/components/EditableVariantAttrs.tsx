'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';

const fieldCls = 'rounded-lg border border-black/15 bg-transparent px-1.5 py-0.5 text-xs text-neutral-900 dark:border-white/20 dark:text-white';

/**
 * Click-to-edit a variant's colour, size, and stock source. Colour/size never
 * touch the SKU string (see EditableSku for that); stock source flips between
 * tracking its own pile and sharing another SKU's, the same mechanism that
 * powers e.g. "Halter with Palazzos" sharing "Halter Neck"'s stock.
 */
export function EditableVariantAttrs({
  code,
  sku,
  color,
  size,
  sharesStockWith,
}: {
  code: string;
  sku: string;
  color?: string;
  size?: string;
  sharesStockWith?: string | null;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [vColor, setVColor] = useState(color ?? '');
  const [vSize, setVSize] = useState(size ?? '');
  const [shareMode, setShareMode] = useState<'own' | 'shared'>(sharesStockWith ? 'shared' : 'own');
  const [shareTarget, setShareTarget] = useState(sharesStockWith ?? '');
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setVColor(color ?? '');
    setVSize(size ?? '');
    setShareMode(sharesStockWith ? 'shared' : 'own');
    setShareTarget(sharesStockWith ?? '');
    setEditing(true);
  }

  async function save() {
    const nextShare = shareMode === 'shared' ? shareTarget.trim().toUpperCase() : null;
    if (shareMode === 'shared' && !nextShare) {
      toast.error('Enter the SKU this shares stock with, or switch back to Own stock');
      return;
    }
    const ok = await ask({
      title: 'Save variant changes?',
      details: [
        { label: 'Colour', value: vColor || '—' },
        { label: 'Size', value: vSize || '—' },
        { label: 'Stock', value: nextShare ? `Shares with ${nextShare}` : 'Own stock' },
      ],
      confirmLabel: 'Save',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${code}/variant`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, color: vColor, size: vSize, sharesStockWith: nextShare }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Failed to save');
      } else {
        toast.success('Variant updated ✓');
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button onClick={startEdit} className="text-left" title="Click to edit colour, size, or stock source">
        <div className="text-neutral-600 hover:text-brand-700 hover:underline dark:text-neutral-300">
          {[color, size].filter(Boolean).join(' / ') || sku} <span className="text-[10px] text-neutral-400">✎</span>
        </div>
        <div className="text-[10px] text-amber-500">{sharesStockWith ? `shares stock with ${sharesStockWith}` : 'own stock'}</div>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex gap-1">
        <input className={`${fieldCls} w-20`} value={vColor} onChange={(e) => setVColor(e.target.value)} placeholder="Colour" />
        <input className={`${fieldCls} w-14`} value={vSize} onChange={(e) => setVSize(e.target.value)} placeholder="Size" />
      </div>
      <div className="flex items-center gap-1">
        <select value={shareMode} onChange={(e) => setShareMode(e.target.value as 'own' | 'shared')} className={fieldCls}>
          <option value="own">Own stock</option>
          <option value="shared">Shared stock</option>
        </select>
        {shareMode === 'shared' ? (
          <input
            className={`${fieldCls} w-32 font-mono`}
            value={shareTarget}
            onChange={(e) => setShareTarget(e.target.value)}
            placeholder="Shares with SKU"
          />
        ) : null}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="text-[11px] font-medium text-emerald-600 disabled:opacity-50">
          ✓ Save
        </button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-neutral-400">
          ✕ Cancel
        </button>
      </div>
    </div>
  );
}
