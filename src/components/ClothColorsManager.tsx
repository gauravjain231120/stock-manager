'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Upload,
  Trash2,
  Pencil,
  X,
  Maximize2,
  Palette,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import type { ClothColorRow } from '@/lib/clothColors';
import { compressImageIfNeeded } from '@/lib/clientImage';

interface Props {
  initialColors: ClothColorRow[];
}

export function ClothColorsManager({ initialColors }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [colors, setColors] = useState<ClothColorRow[]>(initialColors);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ClothColorRow | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Lightbox preview state
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

  // Filtered colors by search
  const filtered = colors.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
    (c.notes && c.notes.toLowerCase().includes(search.trim().toLowerCase()))
  );

  function openAddModal() {
    setEditingItem(null);
    setName('');
    setImageUrl('');
    setNotes('');
    setIsModalOpen(true);
  }

  function openEditModal(item: ClothColorRow) {
    setEditingItem(item);
    setName(item.name);
    setImageUrl(item.imageUrl);
    setNotes(item.notes || '');
    setIsModalOpen(true);
  }

  function closeModal() {
    if (busy || uploading) return;
    setIsModalOpen(false);
    setEditingItem(null);
  }

  async function handleFileUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    setUploading(true);
    try {
      const processed = await compressImageIfNeeded(file);
      const formData = new FormData();
      formData.append('file', processed);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to upload photo');
      setImageUrl(data.url);
      toast.success('Photo uploaded ✓');
    } catch (err: any) {
      toast.error(err.message || 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter a color name');
      return;
    }
    if (!imageUrl.trim()) {
      toast.error('Please upload an image of the cloth');
      return;
    }

    setBusy(true);
    try {
      if (editingItem) {
        // Update existing
        const res = await fetch(`/api/products/colors/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), imageUrl: imageUrl.trim(), notes: notes.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to update');

        setColors((prev) =>
          prev.map((c) => (c.id === editingItem.id ? data.color : c))
        );
        toast.success(`Updated "${data.color.name}" ✓`);
      } else {
        // Create new
        const res = await fetch('/api/products/colors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), imageUrl: imageUrl.trim(), notes: notes.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to save');

        setColors((prev) => [data.color, ...prev]);
        toast.success(`Added "${data.color.name}" ✓`);
      }

      closeModal();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item: ClothColorRow) {
    if (!confirm(`Are you sure you want to delete cloth color "${item.name}"?`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/products/colors/${item.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete');

      setColors((prev) => prev.filter((c) => c.id !== item.id));
      toast.success(`Deleted "${item.name}" ✓`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Top action bar: Search + Total badge + Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={15} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cloth colors…"
              className="w-full rounded-xl border border-black/15 bg-white pl-9 pr-4 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-white/20 dark:bg-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {colors.length} {colors.length === 1 ? 'color' : 'colors'}
          </span>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98]"
        >
          <Plus size={16} />
          <span>Add Cloth Color</span>
        </button>
      </div>

      {/* Grid of Cloth Color Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 bg-neutral-50/50 p-12 text-center dark:border-white/15 dark:bg-neutral-900/50">
          <span className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 mb-3">
            <Palette size={22} />
          </span>
          <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
            {search ? 'No colors match your search' : 'No cloth colors uploaded yet'}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-neutral-400">
            {search
              ? 'Try searching with a different term or clear the filter.'
              : 'Upload photos of your fabric cloths and their color names so you have a quick visual reference.'}
          </p>
          {!search ? (
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus size={15} /> Add first cloth color
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col rounded-2xl border border-black/10 bg-white p-2 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-neutral-900"
            >
              {/* Photo thumbnail */}
              <div
                className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800"
                onClick={() => setLightboxImage({ url: item.imageUrl, name: item.name })}
                title="Click to view full photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 transition duration-200 group-hover:bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="rounded-full bg-black/60 p-2 text-white shadow-lg backdrop-blur-sm">
                    <Maximize2 size={14} />
                  </span>
                </div>
              </div>

              {/* Name & details */}
              <div className="p-2 flex flex-col flex-1 justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-neutral-900 dark:text-white line-clamp-1" title={item.name}>
                    {item.name}
                  </h4>
                  {item.notes ? (
                    <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1" title={item.notes}>
                      {item.notes}
                    </p>
                  ) : null}
                </div>

                {/* Edit & Delete actions */}
                <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-black/5 pt-2 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    title="Edit color name or photo"
                    className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white transition"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    title="Delete cloth color"
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/10 pb-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Palette className="text-brand-600 dark:text-brand-400" size={18} />
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                  {editingItem ? 'Edit Cloth Color' : 'Add New Cloth Color'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={busy || uploading}
                className="rounded-lg p-1 text-neutral-400 hover:bg-black/5 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              {/* Photo Upload Area */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Cloth Photo <span className="text-red-500">*</span>
                </label>

                {imageUrl ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-black/10 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="Cloth preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      disabled={busy || uploading}
                      className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80 transition shadow-md"
                      title="Remove and pick another photo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition cursor-pointer ${
                      uploading
                        ? 'border-brand-500/50 bg-brand-50/50 dark:bg-brand-500/10'
                        : 'border-black/15 hover:border-brand-500 hover:bg-neutral-50 dark:border-white/20 dark:hover:border-brand-500 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading || busy}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2 text-brand-600 dark:text-brand-400">
                        <Loader2 className="animate-spin" size={24} />
                        <span className="text-xs font-medium">Uploading photo…</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                        <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          <Upload size={18} />
                        </span>
                        <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                          Click or drag cloth image here
                        </span>
                        <span className="text-[11px] text-neutral-400">PNG, JPG, WEBP up to 10MB</span>
                      </div>
                    )}
                  </label>
                )}
              </div>

              {/* Color / Cloth Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Color / Cloth Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Red Bandhej, Light Pink Stripes, Navy Blue"
                  required
                  className="w-full rounded-xl border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-white/20 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                />
              </div>

              {/* Notes / Details (optional) */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Notes / Details <span className="text-neutral-400 text-[10px]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Cotton 60-60, Supplier X, Fabric Roll #4"
                  className="w-full rounded-xl border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-white/20 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={busy || uploading}
                  className="rounded-xl border border-black/15 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-neutral-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || uploading || !name.trim() || !imageUrl.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition shadow-sm"
                >
                  {busy ? <Loader2 className="animate-spin" size={15} /> : null}
                  <span>{busy ? 'Saving…' : editingItem ? 'Save Changes' : 'Add Color'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Lightbox Modal (Full image view) */}
      {lightboxImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-2xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name}
              className="max-h-[80vh] w-auto rounded-2xl object-contain shadow-2xl"
            />
            <div className="mt-3 flex items-center justify-between w-full px-2 text-white">
              <span className="text-base font-semibold">{lightboxImage.name}</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="rounded-full bg-white/20 p-1.5 hover:bg-white/30 transition text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
