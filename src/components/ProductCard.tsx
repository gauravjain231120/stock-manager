'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { EditableStock } from '@/components/EditableStock';
import { EditableSku } from '@/components/EditableSku';
import { EditableVariantAttrs } from '@/components/EditableVariantAttrs';
import { inr, num, compareVariant } from '@/lib/format';
import { STANDARD_SIZES } from '@/lib/constants';

interface Variant {
  sku: string;
  color?: string;
  size?: string;
  onHand: number;
  sharesStockWith?: string | null;
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

const input =
  'w-full rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-white/20 dark:text-white';
const label = 'text-xs font-medium text-neutral-500';
const sectionLabel = 'text-[11px] font-semibold uppercase tracking-wide text-neutral-400';
const chip = 'rounded-full border px-2.5 py-1 text-xs font-medium transition';
const chipOn = 'border-brand-600 bg-brand-600 text-white';
const chipOff = 'border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/20 dark:text-neutral-400 dark:hover:bg-white/10';

function qtyColor(n: number) {
  if (n <= 0) return 'text-red-600';
  if (n <= 5) return 'text-amber-600';
  return 'text-emerald-600';
}

export function ProductCard({ group, categories = [] }: { group: CardGroup; categories?: string[] }) {
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
  const [draftVariants, setDraftVariants] = useState<Record<string, { color: string; size: string; newSku: string; sharesStockWith: string }>>({});

  // add-variant fields
  const [vColor, setVColor] = useState('');
  const [vSize, setVSize] = useState('');
  const [vSku, setVSku] = useState('');
  const [vQty, setVQty] = useState('');
  const [vExtraSizes, setVExtraSizes] = useState<Set<string>>(new Set());

  // Variants sorted by colour, then real size order (XS, S, M, L, XL, XXL).
  const variants = [...group.variants].sort((a, b) => compareVariant(a.sku, b.sku));

  function startEdit() {
    setName(group.name);
    setCategory(group.category ?? '');
    setMrp(group.mrp != null ? String(group.mrp) : '');
    setImageUrl(group.imageUrl ?? '');
    setMsg(null);
    
    const initialDrafts: Record<string, { color: string; size: string; newSku: string; sharesStockWith: string }> = {};
    for (const v of group.variants) {
      initialDrafts[v.sku] = { color: v.color ?? '', size: v.size ?? '', newSku: v.sku, sharesStockWith: v.sharesStockWith ?? '' };
    }
    setDraftVariants(initialDrafts);
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

    // Bulk save variants first
    for (const v of group.variants) {
      const draft = draftVariants[v.sku];
      const origShare = v.sharesStockWith ?? '';
      const draftShare = draft?.sharesStockWith ?? '';
      
      if (draft && (draft.color !== (v.color ?? '') || draft.size !== (v.size ?? '') || draft.newSku !== v.sku || draftShare !== origShare)) {
        await fetch(`/api/products/${group.code}/variant`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sku: v.sku, 
            newSku: draft.newSku !== v.sku ? draft.newSku : undefined,
            color: draft.color, 
            size: draft.size,
            sharesStockWith: draftShare !== origShare ? (draftShare.trim() || null) : undefined
          })
        });
      }
    }

    const done = await call(`/api/products/${group.code}`, 'PATCH', {
      name,
      category: category.trim(),
      mrp: mrp ? Number(mrp) : undefined,
      imageUrl: imageUrl || undefined,
    });
    if (done) {
      setEditing(false);
      router.refresh();
    }
  }

  function toggleExtraSize(size: string) {
    setVExtraSizes((s) => {
      const next = new Set(s);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });
  }

  async function addVariant() {
    if (!vColor && !vSize) return;
    // The primary size (if it's one of the checkboxes) shouldn't also be
    // requested as an "extra" — it's already the one the typed SKU is for.
    const extra = [...vExtraSizes].filter((s) => s !== vSize.trim().toUpperCase());
    const ok = await ask({
      title: 'Add variant?',
      details: [
        { label: 'Variant', value: [vColor, vSize].filter(Boolean).join(' / ') },
        ...(vSku.trim() ? [{ label: 'SKU', value: vSku.trim().toUpperCase() }] : []),
        { label: 'Opening stock', value: vQty || '0' },
        ...(extra.length ? [{ label: 'Also add sizes', value: extra.join(', ') }] : []),
      ],
      confirmLabel: 'Add',
    });
    if (!ok) return;
    const done = await call(`/api/products/${group.code}/variant`, 'POST', {
      color: vColor || undefined,
      size: vSize || undefined,
      sku: vSku.trim() || undefined,
      openingQty: vQty ? Number(vQty) : 0,
      extraSizes: extra.length ? extra : undefined,
    });
    if (done) { setVColor(''); setVSize(''); setVSku(''); setVQty(''); setVExtraSizes(new Set()); }
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
    const pw = await ask({
      title: 'Delete product?',
      description: 'This cannot be undone. Enter your password to confirm.',
      details: [
        { label: 'Product', value: group.name },
        { label: 'Variants', value: String(group.variantCount) },
        { label: 'Stock removed', value: String(group.totalStock) },
      ],
      tone: 'danger',
      confirmLabel: 'Delete',
      password: true,
    });
    if (typeof pw !== 'string' || !pw) return;
    await call(`/api/products/${group.code}`, 'DELETE', { password: pw });
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900 sm:flex-row">
      {!editing ? (
        <>
          {/* Left: Image */}
          <div className="relative aspect-[4/5] w-full shrink-0 bg-neutral-100 dark:bg-neutral-800 sm:w-48 sm:border-r sm:border-black/10 dark:sm:border-white/10">
            {group.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.imageUrl} alt={group.name} className="h-full w-full object-cover object-top" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">No image</div>
            )}
            <div className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium backdrop-blur-sm" style={{ color: group.totalStock > 5 ? "#4ade80" : group.totalStock > 0 ? "#facc15" : "#f87171" }}>
              {group.totalStock > 5 ? "In Stock" : group.totalStock > 0 ? "Low Stock" : "Out of Stock"}
            </div>
          </div>

          {/* Middle: Details */}
          <div className="flex flex-1 flex-col justify-between p-4 sm:border-r sm:border-black/10 dark:sm:border-white/10">
            <div>
              <div className="truncate text-base font-semibold">{group.name}</div>
              <div className="font-mono text-[11px] text-neutral-500">{group.code}</div>
              
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                {group.category ? <Badge>{group.category}</Badge> : null}
                {group.mrp ? <span>₹{group.mrp} MRP</span> : null}
              </div>

              <div className="mt-6">
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">Total Stock</div>
                <div className={`text-2xl font-bold tabular-nums ${qtyColor(group.totalStock)}`}>{num(group.totalStock)}</div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button onClick={startEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                <Pencil size={14} /> Edit
              </button>
              <button onClick={deleteProduct} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/10 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-600/20 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>

          {/* Right: Variants List */}
          <div className="flex w-full flex-col bg-black/[0.01] p-0 sm:w-[500px] dark:bg-white/[0.01]">
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/5">
              <span className={sectionLabel}>Variants & Stock</span>
              <span className="text-[11px] text-neutral-400">{variants.length} items</span>
            </div>
            <div className="custom-scrollbar max-h-56 overflow-y-auto sm:max-h-[300px]">
              <table className="w-full text-xs">
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.sku} className="border-b border-black/5 last:border-0 dark:border-white/5">
                      <td className="py-2 pl-4 pr-2">
                        <EditableVariantAttrs
                          code={group.code}
                          sku={v.sku}
                          color={v.color}
                          size={v.size}
                          sharesStockWith={v.sharesStockWith}
                        />
                        <div className="font-mono text-[10px] text-neutral-400">{v.sku}</div>
                      </td>
                      <td className="py-2 pr-4 text-right align-middle">
                        <EditableStock sku={v.sku} value={v.onHand} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="flex w-full flex-col gap-5 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Left Image Uploader in Edit Mode */}
            <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-dashed border-black/15 p-3 sm:w-48 dark:border-white/15">
              <span className={label}>Photo</span>
              <div className="aspect-[4/5] w-full overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
                {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover object-top" /> : null}
              </div>
              <label className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                <Upload size={13} /> {uploading ? 'Uploading…' : 'Choose file'}
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="hidden" disabled={uploading} />
              </label>
              <input className={`${input} text-[10px] mt-1`} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="…or URL" />
            </div>

            {/* Middle & Right Edit Forms */}
            <div className="flex flex-1 flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className={label}>Product name</span>
                  <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={label}>Category</span>
                  <input className={input} list={`cat-${group.code}`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Halter Neck" />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-1">
                  <span className={label}>MRP ₹</span>
                  <input className={input} type="number" min={0} value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="999" />
                </label>
              </div>

              {/* Bulk Edit Variants Area */}
              <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                <div className="bg-black/[0.025] px-3 py-2 dark:bg-white/[0.04]">
                  <span className={sectionLabel}>Edit Variants (Color & Size)</span>
                </div>
                <div className="divide-y divide-black/5 max-h-64 overflow-y-auto custom-scrollbar dark:divide-white/5">
                  {variants.map((v) => (
                    <div key={v.sku} className="grid grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,1.5fr)_minmax(0,3fr)_auto] items-center gap-2 px-3 py-2">
                      <input 
                        type="text"
                        className={`${input} w-full min-w-0 font-mono text-[10px] p-1.5 h-8`} 
                        placeholder="SKU"
                        value={draftVariants[v.sku]?.newSku ?? ''} 
                        onChange={e => setDraftVariants(prev => ({ ...prev, [v.sku]: { ...prev[v.sku], newSku: e.target.value } }))} 
                        title="Edit SKU"
                      />
                      <input 
                        type="text"
                        className={`${input} w-full min-w-0 p-1.5 h-8`} 
                        placeholder="Colour"
                        value={draftVariants[v.sku]?.color ?? ''} 
                        onChange={e => setDraftVariants(prev => ({ ...prev, [v.sku]: { ...prev[v.sku], color: e.target.value } }))} 
                      />
                      <input 
                        type="text"
                        className={`${input} w-full min-w-0 p-1.5 h-8`} 
                        placeholder="Size"
                        value={draftVariants[v.sku]?.size ?? ''} 
                        onChange={e => setDraftVariants(prev => ({ ...prev, [v.sku]: { ...prev[v.sku], size: e.target.value } }))} 
                      />
                      <input 
                        type="text"
                        className={`${input} w-full min-w-0 font-mono text-[10px] p-1.5 h-8`} 
                        placeholder="Shared SKU"
                        value={draftVariants[v.sku]?.sharesStockWith ?? ''} 
                        onChange={e => setDraftVariants(prev => ({ ...prev, [v.sku]: { ...prev[v.sku], sharesStockWith: e.target.value } }))} 
                        title="Shares stock with SKU (leave empty for own stock)"
                      />
                      <button type="button" onClick={() => removeVariant(v.sku)} disabled={busy} className="shrink-0 text-neutral-400 hover:text-red-500" title="Remove"><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
                
                {/* Add new variant block */}
                <div className="border-t border-black/10 bg-black/[0.015] p-3 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className={`mb-2 ${sectionLabel}`}>Add a variant</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={`${input} px-2 py-1.5 text-xs`} value={vColor} onChange={(e) => setVColor(e.target.value)} placeholder="Colour" />
                    <input className={`${input} px-2 py-1.5 text-xs`} value={vSize} onChange={(e) => setVSize(e.target.value)} placeholder="Size" />
                    <input className={`${input} px-2 py-1.5 font-mono text-xs`} value={vSku} onChange={(e) => setVSku(e.target.value)} placeholder="SKU (optional)" />
                    <input className={`${input} px-2 py-1.5 text-xs`} type="number" min={0} value={vQty} onChange={(e) => setVQty(e.target.value)} placeholder="Opening qty" />
                  </div>
                  {vSku.trim() ? (
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      <span className="text-[10px] text-neutral-400">Also add sizes (swaps the size in the SKU above):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {STANDARD_SIZES.filter((sz) => sz !== vSize.trim().toUpperCase()).map((sz) => {
                          const on = vExtraSizes.has(sz);
                          return (
                            <button type="button" key={sz} onClick={() => toggleExtraSize(sz)} className={`${chip} ${on ? chipOn : chipOff}`}>{sz}</button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <button onClick={addVariant} disabled={busy || (!vColor && !vSize)} className="mt-3 w-full rounded-lg border border-black/15 py-1.5 text-xs font-medium transition hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10">
                    + Add variant
                  </button>
                </div>
              </div>
              
              <div className="mt-auto flex items-center justify-end gap-2 pt-2">
                {msg ? <span className="mr-auto text-xs text-neutral-500">{msg}</span> : null}
                <button onClick={() => setEditing(false)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">Cancel</button>
                <button onClick={save} disabled={busy || uploading || !name} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save all changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {!editing && msg ? <span className="absolute bottom-2 right-2 text-xs text-neutral-500">{msg}</span> : null}
    </div>
  );
}
