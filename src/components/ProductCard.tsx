'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { EditableStock } from '@/components/EditableStock';
import { inr, num } from '@/lib/format';

interface Variant {
  sku: string;
  color?: string;
  size?: string;
  onHand: number;
}
export interface CardGroup {
  code: string;
  name: string;
  category?: string;
  imageUrl?: string;
  mrp?: number;
  variantCount: number;
  totalStock: number;
  variants: Variant[];
}

const input = 'w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20';

function qtyColor(n: number) {
  if (n <= 0) return 'text-red-600';
  if (n <= 5) return 'text-amber-600';
  return 'text-emerald-600';
}

export function ProductCard({ group }: { group: CardGroup }) {
  const router = useRouter();
  const ask = useConfirm();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // edit fields
  const [name, setName] = useState(group.name);
  const [category, setCategory] = useState(group.category ?? '');
  const [mrp, setMrp] = useState(group.mrp != null ? String(group.mrp) : '');
  const [imageUrl, setImageUrl] = useState(group.imageUrl ?? '');
  const [uploading, setUploading] = useState(false);

  // add-variant fields
  const [vColor, setVColor] = useState('');
  const [vSize, setVSize] = useState('');
  const [vQty, setVQty] = useState('');

  function startEdit() {
    setName(group.name);
    setCategory(group.category ?? '');
    setMrp(group.mrp != null ? String(group.mrp) : '');
    setImageUrl(group.imageUrl ?? '');
    setMsg(null);
    setEditing(true);
  }

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || `Error ${res.status}`);
        return false;
      }
      router.refresh();
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) setMsg(data?.error || 'Upload failed');
      else setImageUrl(data.url);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const ok = await ask({
      title: 'Save changes?',
      details: [
        { label: 'Name', value: name },
        { label: 'Category', value: category || '—' },
        { label: 'MRP', value: mrp ? `₹${mrp}` : '—' },
      ],
      confirmLabel: 'Save',
    });
    if (!ok) return;
    const done = await call(`/api/products/${group.code}`, 'PATCH', {
      name,
      category: category || undefined,
      mrp: mrp ? Number(mrp) : undefined,
      imageUrl: imageUrl || undefined,
    });
    if (done) setEditing(false);
  }

  async function addVariant() {
    if (!vColor && !vSize) return;
    const ok = await ask({
      title: 'Add variant?',
      details: [
        { label: 'Variant', value: [vColor, vSize].filter(Boolean).join(' / ') },
        { label: 'Opening stock', value: vQty || '0' },
      ],
      confirmLabel: 'Add',
    });
    if (!ok) return;
    const done = await call(`/api/products/${group.code}/variant`, 'POST', {
      color: vColor || undefined,
      size: vSize || undefined,
      openingQty: vQty ? Number(vQty) : 0,
    });
    if (done) { setVColor(''); setVSize(''); setVQty(''); }
  }

  async function removeVariant(sku: string) {
    const ok = await ask({
      title: 'Remove variant?',
      description: 'This variant and its stock will be removed.',
      details: [{ label: 'SKU', value: sku }],
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    await call(`/api/products/${group.code}/variant?sku=${encodeURIComponent(sku)}`, 'DELETE');
  }

  async function deleteProduct() {
    const ok = await ask({
      title: 'Delete product?',
      description: 'This cannot be undone.',
      details: [
        { label: 'Product', value: group.name },
        { label: 'Variants', value: String(group.variantCount) },
        { label: 'Stock removed', value: String(group.totalStock) },
      ],
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    await call(`/api/products/${group.code}`, 'DELETE');
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="aspect-square w-full bg-neutral-100 dark:bg-neutral-800">
        {imageUrl || group.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={editing ? imageUrl || group.imageUrl : group.imageUrl} alt={group.name} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">No image</div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {!editing ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{group.name}</div>
                <div className="font-mono text-xs text-neutral-500">{group.code}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-lg font-semibold tabular-nums ${qtyColor(group.totalStock)}`}>{num(group.totalStock)}</div>
                <div className="text-[11px] text-neutral-400">in stock</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
              {group.category ? <Badge>{group.category}</Badge> : null}
              <span>{group.variantCount} variants</span>
              {group.mrp ? <span>· {inr(group.mrp)}</span> : null}
            </div>
            <table className="mt-3 w-full text-xs">
              <tbody>
                {group.variants.map((v) => (
                  <tr key={v.sku} className="border-t border-black/5 dark:border-white/5">
                    <td className="py-1 text-neutral-600 dark:text-neutral-300">{[v.color, v.size].filter(Boolean).join(' / ') || v.sku}</td>
                    <td className="py-1 text-right"><EditableStock sku={v.sku} value={v.onHand} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-auto flex items-center justify-end gap-2 pt-3">
              <button onClick={startEdit} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">Edit</button>
              <button onClick={deleteProduct} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Delete</button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
            <div className="flex gap-2">
              <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" />
              <input className={input} type="number" min={0} value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="MRP ₹" />
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-xs" />
              {uploading ? <span>uploading…</span> : null}
            </div>
            <input className={input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="…or image URL" />

            <div className="rounded-lg border border-black/10 dark:border-white/10">
              <div className="px-3 py-1.5 text-xs font-medium text-neutral-500">Variants</div>
              <table className="w-full text-xs">
                <tbody>
                  {group.variants.map((v) => (
                    <tr key={v.sku} className="border-t border-black/5 dark:border-white/5">
                      <td className="py-1 pl-3 text-neutral-600 dark:text-neutral-300">{[v.color, v.size].filter(Boolean).join(' / ') || v.sku}</td>
                      <td className="py-1 text-right"><EditableStock sku={v.sku} value={v.onHand} /></td>
                      <td className="py-1 pr-2 text-right">
                        <button onClick={() => removeVariant(v.sku)} disabled={busy} className="px-1 text-red-600 hover:text-red-700" title="Remove variant">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center gap-2 border-t border-black/5 p-2 dark:border-white/5">
                <input className="w-24 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20" value={vColor} onChange={(e) => setVColor(e.target.value)} placeholder="Color" />
                <input className="w-20 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20" value={vSize} onChange={(e) => setVSize(e.target.value)} placeholder="Size" />
                <input className="w-16 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20" type="number" min={0} value={vQty} onChange={(e) => setVQty(e.target.value)} placeholder="Qty" />
                <button onClick={addVariant} disabled={busy || (!vColor && !vSize)} className="rounded-lg border border-black/15 px-2 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10">+ Add variant</button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {msg ? <span className="mr-auto text-xs text-neutral-500">{msg}</span> : null}
              <button onClick={() => setEditing(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">Cancel</button>
              <button onClick={save} disabled={busy || uploading || !name} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
        {!editing && msg ? <span className="mt-2 text-right text-xs text-neutral-500">{msg}</span> : null}
      </div>
    </div>
  );
}
