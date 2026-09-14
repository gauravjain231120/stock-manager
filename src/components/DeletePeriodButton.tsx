'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';
import { inr, dateOnly } from '@/lib/format';
import type { PeriodTotals } from '@/lib/accounts';

/**
 * Permanently deletes a closed period and every entry in it, behind a
 * confirm modal that spells out exactly what's being removed. Used both from
 * the /account past-periods list (a client component — removes it from the
 * on-screen list via `onDeleted`) and from the /account/[id] detail page (a
 * server component — a callback can't cross that boundary, so it passes a
 * plain `redirectTo` path instead and this navigates there itself).
 */
export function DeletePeriodButton({
  periodId,
  from,
  to,
  totals,
  onDeleted,
  redirectTo,
}: {
  periodId: string;
  from: string;
  to: string;
  totals: PeriodTotals;
  onDeleted?: () => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = await ask({
      title: 'Delete this period?',
      description: 'This permanently removes the period and every entry in it. This cannot be undone.',
      details: [
        { label: 'Range', value: `${dateOnly(from)} – ${dateOnly(to)}` },
        { label: 'Total expense', value: inr(totals.expense) },
        { label: 'Total received', value: inr(totals.received) },
        { label: 'Net', value: inr(totals.net) },
      ],
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/account/periods/${periodId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Period deleted ✓');
        onDeleted?.();
        if (redirectTo) router.push(redirectTo);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error || 'Could not delete period');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      title="Delete this period and all its entries"
      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
    >
      <Trash2 size={12} /> {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
