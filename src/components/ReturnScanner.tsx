'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';

interface Scanned {
  id: string;
  trackingId: string;
  sku: string;
  name: string;
  channel: string | null;
  orderId: string | null;
  qty: number;
}

const CHOICES = [
  { key: 'GOOD' as const, label: 'Good', hint: 'back to sellable stock', Icon: CheckCircle2, cls: 'bg-emerald-600 hover:bg-emerald-700' },
  { key: 'BAD' as const, label: 'Bad', hint: 'damaged, kept out of stock', Icon: AlertTriangle, cls: 'bg-amber-600 hover:bg-amber-700' },
  { key: 'WRONG' as const, label: 'Wrong', hint: 'not my item — claim it', Icon: XCircle, cls: 'bg-red-600 hover:bg-red-700' },
];

/**
 * Barcode box for incoming return parcels. A USB scanner types the tracking
 * number and presses Enter, which opens the grade popup — so a whole parcel is
 * one scan plus one tap.
 */
export function ReturnScanner() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState<Scanned | null>(null);
  const [note, setNote] = useState('');

  // Keep the caret in the box so the next parcel can be scanned straight away.
  useEffect(() => {
    if (!hit) inputRef.current?.focus();
  }, [hit]);

  async function onScan(e: FormEvent) {
    e.preventDefault();
    const trackingId = code.trim();
    if (!trackingId) return;
    setBusy(true);
    try {
      const res = await fetch('/api/return-shipments/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Not found');
        setCode('');
        return;
      }
      setHit(data as Scanned);
      setNote('');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function grade(condition: 'GOOD' | 'BAD' | 'WRONG') {
    if (!hit) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/return-shipments/${hit.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Failed to save');
      else {
        toast.success(
          condition === 'GOOD' ? `Back in stock: ${hit.qty} × ${hit.sku} ✓`
            : condition === 'BAD' ? 'Marked damaged ✓'
            : 'Marked wrong item — claim it ✓',
        );
        setHit(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={onScan} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5"><ScanLine size={14} /> Scan the parcel barcode</span>
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
            autoFocus
            placeholder="Scan or type the tracking number, then press Enter…"
            className="rounded-lg border border-black/15 bg-transparent px-3 py-3 font-mono text-base text-neutral-900 dark:border-white/20 dark:text-white"
          />
        </label>
        <p className="mt-2 text-xs text-neutral-400">
          A USB scanner types the number and presses Enter by itself. Typing the last few digits works too.
        </p>
      </form>

      {hit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-neutral-900">
            <h3 className="text-base font-semibold">Return received</h3>

            <div className="mt-3 rounded-lg bg-black/5 p-3 dark:bg-white/5">
              <div className="font-medium">{hit.name}</div>
              <div className="font-mono text-xs text-neutral-500">{hit.sku}</div>
              <div className="mt-1 text-xs text-neutral-500">
                {hit.channel ? PLATFORM_LABELS[hit.channel as Platform] ?? hit.channel : 'No platform'}
                {hit.orderId ? ` · Order ${hit.orderId}` : ''}
                {hit.qty > 1 ? ` · ${hit.qty} units` : ''}
              </div>
              <div className="font-mono text-[11px] text-neutral-400">Tracking {hit.trackingId}</div>
            </div>

            <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">What was inside?</p>
            <div className="mt-2 flex flex-col gap-2">
              {CHOICES.map(({ key, label, hint, Icon, cls }) => (
                <button
                  key={key}
                  onClick={() => grade(key)}
                  disabled={busy}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50 ${cls}`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  <span className="ml-auto text-xs font-normal opacity-80">{hint}</span>
                </button>
              ))}
            </div>

            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="mt-3 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
            />

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setHit(null)}
                className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
