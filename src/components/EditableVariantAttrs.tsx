'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Link2, Pencil, X } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';

const fieldCls =
  'rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs text-neutral-900 focus:border-brand-500 focus:outline-none dark:border-white/20 dark:text-white';
const iconBtn =
  'inline-flex size-6 items-center justify-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10';
const segBtn = 'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition';
const segOn = 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white';
const segOff = 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200';

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
  const [applyToColorGroup, setApplyToColorGroup] = useState(false);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setVColor(color ?? '');
    setVSize(size ?? '');
    setShareMode(sharesStockWith ? 'shared' : 'own');
    setShareTarget(sharesStockWith ?? '');
    setApplyToColorGroup(false);
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
        ...(nextShare && applyToColorGroup
          ? [{ label: 'Also applies to', value: `every other size of ${vColor || 'this colour'} (size-matched)` }]
          : []),
      ],
      confirmLabel: 'Save',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${code}/variant`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          color: vColor,
          size: vSize,
          sharesStockWith: nextShare,
          applyToColorGroup: nextShare ? applyToColorGroup : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Failed to save');
      } else {
        const skippedCount = Array.isArray(data?.skipped) ? data.skipped.length : 0;
        toast.success(skippedCount ? `Variant updated ✓ (${skippedCount} size(s) left on own stock — no matching target)` : 'Variant updated ✓');
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button onClick={startEdit} className="group flex flex-col items-start gap-1 text-left" title="Click to edit colour, size, or stock source">
        <span className="inline-flex items-center gap-1 text-neutral-700 dark:text-neutral-200">
          {[color, size].filter(Boolean).join(' / ') || sku}
          <Pencil size={11} className="text-neutral-400 opacity-0 transition group-hover:opacity-100" />
        </span>
        {sharesStockWith ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <Link2 size={9} /> {sharesStockWith}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex gap-1.5">
        <input className={`${fieldCls} w-20`} value={vColor} onChange={(e) => setVColor(e.target.value)} placeholder="Colour" />
        <input className={`${fieldCls} w-14`} value={vSize} onChange={(e) => setVSize(e.target.value)} placeholder="Size" />
      </div>

      <div className="flex rounded-lg bg-black/5 p-0.5 dark:bg-white/10">
        <button type="button" onClick={() => setShareMode('own')} className={`${segBtn} ${shareMode === 'own' ? segOn : segOff}`}>
          Own stock
        </button>
        <button type="button" onClick={() => setShareMode('shared')} className={`${segBtn} ${shareMode === 'shared' ? segOn : segOff}`}>
          Shared stock
        </button>
      </div>

      {shareMode === 'shared' ? (
        <div className="flex flex-col gap-1.5">
          <input
            className={`${fieldCls} w-full font-mono`}
            value={shareTarget}
            onChange={(e) => setShareTarget(e.target.value)}
            placeholder="Shares stock with SKU…"
          />
          <label
            className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400"
            title="Sets Red/M, Red/L etc. to share with the same target SKU, size-swapped, instead of just this one"
          >
            <input type="checkbox" checked={applyToColorGroup} onChange={(e) => setApplyToColorGroup(e.target.checked)} className="size-3 accent-brand-600" />
            Apply to every size of this colour
          </label>
        </div>
      ) : null}

      <div className="flex justify-end gap-1">
        <button onClick={() => setEditing(false)} className={`${iconBtn} text-neutral-400`} title="Cancel">
          <X size={14} />
        </button>
        <button onClick={save} disabled={busy} className={`${iconBtn} text-emerald-600 disabled:opacity-50`} title="Save">
          <Check size={14} />
        </button>
      </div>
    </div>
  );
}
