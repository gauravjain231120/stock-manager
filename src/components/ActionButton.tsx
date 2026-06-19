'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmProvider';

type Variant = 'primary' | 'secondary' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200',
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
}) {
  const router = useRouter();
  const ask = useConfirm();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    setMsg(null);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || `Error ${res.status}`);
      } else {
        setMsg(successMessage);
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy || pending}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${styles[variant]}`}
      >
        {busy || pending ? '…' : label}
      </button>
      {msg ? <span className="text-xs text-neutral-500">{msg}</span> : null}
    </span>
  );
}
