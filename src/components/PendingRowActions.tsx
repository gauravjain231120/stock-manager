'use client';

import { useState } from 'react';
import { ShipButton } from '@/components/ShipButton';
import { ProduceButton } from '@/components/ProduceButton';
import { CancelButton } from '@/components/CancelButton';
import { EditPendingButton } from '@/components/EditPendingButton';
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
