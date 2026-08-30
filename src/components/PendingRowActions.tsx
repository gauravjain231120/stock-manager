'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShipButton } from '@/components/ShipButton';
import { ProduceButton } from '@/components/ProduceButton';
import { CancelButton } from '@/components/CancelButton';
import { EditPendingButton } from '@/components/EditPendingButton';
import { useToast } from '@/components/ToastProvider';
import { RowMenu, menuItemCls } from '@/components/RowMenu';
import type { QueueRow } from '@/components/ShipQueue';

/**
 * A queue row's Action cell: Ship and Produce stay out front, Edit and Cancel
 * move into the "⋯" menu.
 *
 * The two dialogs are rendered here rather than inside the menu — the menu panel
 * unmounts the moment it closes, which would close the dialog with it. Mounting
 * them only while open also means each one starts from the row's current values.
 */
export function PendingRowActions({
  row,
  products,
  /** Lines of a multi-item order ship together from the group header. */
  grouped,
}: {
  row: QueueRow;
  products: { sku: string; name: string }[];
  grouped: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [cancel, setCancel] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function toggleReady() {
    const nextReady = !row.ready;
    try {
      const res = await fetch(`/api/pending/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ready: nextReady }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Failed to update');
      else {
        toast.success(nextReady ? 'Marked ready — off the print sheet ✓' : 'Back in the pack pile');
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {grouped ? null : (
        <ShipButton
          id={row.id}
          name={row.name}
          sku={row.sku}
          qty={row.qty}
          stock={row.free}
          orderId={row.orderId}
          trackingId={row.trackingId}
        />
      )}
      {/* Sized against what's left for THIS row, so the box opens on the units
          this order alone is missing — not the whole pile's shortfall. */}
      <ProduceButton sku={row.sku} stockSku={row.stockSku} name={row.name} onHand={row.free} need={row.qty} />

      <button
        onClick={toggleReady}
        title={row.ready ? 'Back in the pack pile — will print again' : 'Packed and set aside — leaves it off the print sheet'}
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
          row.ready
            ? 'border-emerald-600/40 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
            : 'border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10'
        }`}
      >
        {row.ready ? 'Ready ✓' : 'Mark ready'}
      </button>

      <RowMenu>
        {(close) => (
          <>
            <button className={menuItemCls} onClick={() => { close(); setEdit(true); }}>Edit</button>
            <button
              className={`${menuItemCls} text-red-600 dark:text-red-400`}
              onClick={() => { close(); setCancel(true); }}
            >
              Cancel
            </button>
          </>
        )}
      </RowMenu>

      {edit ? <EditPendingButton row={row} products={products} open onOpenChange={setEdit} hideTrigger /> : null}
      {cancel ? (
        <CancelButton id={row.id} name={row.name} sku={row.sku} qty={row.qty} open onOpenChange={setCancel} hideTrigger />
      ) : null}
    </span>
  );
}
