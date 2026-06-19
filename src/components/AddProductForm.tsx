'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmProvider';

const input = 'rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20';
const btn = 'rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-neutral-200';

function slug(s: string) {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}
function parseList(s: string) {
  return [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];
}
function variantSku(base: string, color?: string, size?: string) {
  return [slug(base), color ? slug(color) : null, size ? slug(size) : null].filter(Boolean).join('-');
}

export function AddProductForm() {
  const router = useRouter();
  const ask = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('');
  const [mrp, setMrp] = useState('');
  const [colorsInput, setColorsInput] = useState('');
  const [sizesInput, setSizesInput] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const colors = parseList(colorsInput);
  const sizes = parseList(sizesInput);

  const combos = useMemo(() => {
    if (colors.length && sizes.length) return colors.flatMap((c) => sizes.map((s) => ({ color: c, size: s })));
    if (sizes.length) return sizes.map((s) => ({ color: undefined, size: s }));
    if (colors.length) return colors.map((c) => ({ color: c, size: undefined }));
    return [{ color: undefined, size: undefined }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorsInput, sizesInput]);

  const baseCode = code || slug(name).slice(0, 10);

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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const variants = combos.map((c) => ({
      color: c.color,
      size: c.size,
      openingQty: Number(qty[`${c.color ?? ''}|${c.size ?? ''}`] || 0),
    }));
    const totalOpening = variants.reduce((a, v) => a + (v.openingQty || 0), 0);

    const ok = await ask({
      title: 'Create product?',
      details: [
        { label: 'Name', value: name },
        { label: 'Code', value: baseCode || '—' },
        { label: 'Variants', value: String(variants.length) },
        { label: 'Opening stock', value: String(totalOpening) },
        ...(mrp ? [{ label: 'MRP', value: `₹${mrp}` }] : []),
      ],
      confirmLabel: 'Create',
    });
    if (!ok) return;

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: baseCode,
          name,
          category: category || undefined,
          imageUrl: imageUrl || undefined,
          mrp: mrp ? Number(mrp) : undefined,
          colors,
          sizes,
          variants,
        }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data?.error || `Error ${res.status}`);
      else {
        setMsg(`Created ${data.created} variant SKU(s) ✓`);
        setName(''); setCode(''); setCategory(''); setMrp(''); setColorsInput(''); setSizesInput(''); setImageUrl(''); setQty({});
        router.refresh();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className={btn} onClick={() => setOpen(true)}>+ Add product</button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">New product</h2>
        <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => setOpen(false)}>Close</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Product name
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Round Neck T-Shirt" required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          SKU code (prefix)
          <input className={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={slug(name).slice(0, 10) || 'TSHIRT'} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Category
          <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="T-Shirts" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          MRP (₹)
          <input className={input} type="number" min={0} value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="599" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Colors (comma separated)
          <input className={input} value={colorsInput} onChange={(e) => setColorsInput(e.target.value)} placeholder="Black, White, Navy" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Sizes (comma separated)
          <input className={input} value={sizesInput} onChange={(e) => setSizesInput(e.target.value)} placeholder="S, M, L, XL" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Photo — upload
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-xs" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-500">
          …or paste image URL
          <input className={input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
        </label>
        {uploading ? <span className="text-xs text-neutral-500">uploading…</span> : null}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="preview" className="h-16 w-16 rounded-lg border border-black/10 object-cover dark:border-white/10" />
        ) : null}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-neutral-500">
          {combos.length} variant{combos.length === 1 ? '' : 's'} — set opening stock for each
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-800">
              <tr><th className="px-3 py-1.5">SKU</th><th className="px-3 py-1.5">Color</th><th className="px-3 py-1.5">Size</th><th className="px-3 py-1.5 text-right">Opening qty</th></tr>
            </thead>
            <tbody>
              {combos.map((c) => {
                const key = `${c.color ?? ''}|${c.size ?? ''}`;
                return (
                  <tr key={key} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-1.5 font-mono text-xs">{variantSku(baseCode || 'SKU', c.color, c.size)}</td>
                    <td className="px-3 py-1.5">{c.color ?? '—'}</td>
                    <td className="px-3 py-1.5">{c.size ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <input className={`${input} w-24 text-right`} type="number" min={0} value={qty[key] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [key]: e.target.value }))} placeholder="0" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button className={btn} disabled={busy || uploading || !name}>{busy ? 'Saving…' : 'Create product'}</button>
        {msg ? <span className="text-xs text-neutral-500">{msg}</span> : null}
      </div>
    </form>
  );
}
