'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';
import type { MakeRow } from '@/components/ToMakeTable';

/**
 * Produces every row on the "To make" list in one go — records the same
 * PRODUCE entry each row's own Produce button would (for exactly the
 * quantity it's short), just fired for all of them together.
 */
export function ProduceAllButton({ rows }: { rows: MakeRow[] }) {
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const totalUnits = rows.reduce((a, r) => a + r.make, 0);
  if (rows.length === 0) return null;

  async function produceAll() {
    const ok = await ask({
      title: 'Produce everything on this list?',
      description: `Adds stock for all ${rows.length} item${rows.length === 1 ? '' : 's'} — ${totalUnits} unit${totalUnits === 1 ? '' : 's'} total, exactly what's short for the queue right now.`,
      confirmLabel: `Produce all (${totalUnits})`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const results = await Promise.all(
        rows.map(async (r) => {
          try {
            const res = await fetch('/api/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sku: r.stockSku, action: 'PRODUCE', qty: r.make }),
            });
            if (res.ok) return { ok: true as const };
            const data = await res.json().catch(() => ({}));
            return { ok: false as const, name: r.name, error: data?.error as string | undefined };
          } catch (e) {
            return { ok: false as const, name: r.name, error: e instanceof Error ? e.message : undefined };
          }
        }),
      );
      const failed = results.filter((r): r is { ok: false; name: string; error?: string } => !r.ok);
      if (failed.length === 0) {
        toast.success(`Made ${totalUnits} unit${totalUnits === 1 ? '' : 's'} across ${rows.length} item${rows.length === 1 ? '' : 's'} ✓`);
      } else {
        toast.error(`${failed.length} of ${rows.length} failed — ${failed.map((f) => f.name).join(', ')}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={produceAll}
      disabled={busy}
      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
    >
      {busy ? 'Making…' : `Produce all (${totalUnits})`}
    </button>
  );
}
