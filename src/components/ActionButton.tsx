'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';

type Variant = 'primary' | 'secondary' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

/**
 * Calls an API endpoint, then refreshes the server components on the page.
 * Used for all the "do something" buttons (simulate, ingest, sync, grade...).
 */
export function ActionButton({
  label,
  endpoint,
  method = 'POST',
  body,
  variant = 'secondary',
  confirm,
  confirmTitle,
  confirmDetails,
  confirmLabel,
  successMessage = 'Done ✓',
  disabled = false,
  title,
  undoEndpoint,
}: {
  label: string;
  endpoint: string;
  method?: 'POST' | 'PUT' | 'GET' | 'DELETE';
  body?: unknown;
  variant?: Variant;
  // Show a confirmation modal before acting. `confirm` is the description line.
  confirm?: string;
  confirmTitle?: string;
  confirmDetails?: { label: string; value: string }[];
  confirmLabel?: string;
  // A plain string (server components can't pass functions to client components).
  successMessage?: string;
  disabled?: boolean;
  title?: string;
  /**
   * Where to POST the `undo` payload the endpoint returned, to put things back.
   * When set and the response carries `undo`, the toast offers an Undo button.
   */
  undoEndpoint?: string;
}) {
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function runUndo(payload: unknown) {
    if (!undoEndpoint) return;
    try {
      const res = await fetch(undoEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Could not undo');
      else {
        toast.success('Restored ✓');
        startTransition(() => router.refresh());
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not undo');
    }
  }

  async function run() {
    if (confirm || confirmTitle || confirmDetails) {
      const ok = await ask({
        title: confirmTitle ?? 'Please confirm',
        description: confirm,
        details: confirmDetails,
        tone: variant === 'danger' ? 'danger' : 'default',
        confirmLabel: confirmLabel ?? label,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || `Error ${res.status}`);
      } else {
        const undo = undoEndpoint && data?.undo ? { label: 'Undo', onClick: () => runUndo(data.undo) } : undefined;
        toast.success(successMessage, undo ? { action: undo } : undefined);
        startTransition(() => router.refresh());
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy || pending || disabled}
      title={title}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]}`}
    >
      {busy || pending ? '…' : label}
    </button>
  );
}
