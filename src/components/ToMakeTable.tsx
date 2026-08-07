import { Panel, Table, Th, Td, Tr } from '@/components/ui';
import { ProduceButton } from '@/components/ProduceButton';

/** One physical garment pile that's short of what the queue has promised. */
export interface MakeRow {
  /** The SKU actually sewn — a bundle set resolves to its component garment. */
  stockSku: string;
  name: string;
  onHand: number;
  /** Units the whole queue needs from this pile. */
  needed: number;
  /** needed − onHand, always > 0 on a listed row. */
  make: number;
}

function stockColor(n: number) {
  if (n <= 0) return 'text-red-600';
  if (n <= 5) return 'text-amber-600';
  return 'text-emerald-600';
}

/**
 * The sewing list: everything the queue can't cover yet, one row per garment
 * with the number to make. Aggregated across the WHOLE queue (not the platform
 * or category filter above it) — two orders for the same size are one thing to
 * sew, and production doesn't care which marketplace they came from.
 */
export function ToMakeTable({ rows }: { rows: MakeRow[] }) {
  const units = rows.reduce((a, r) => a + r.make, 0);

  if (rows.length === 0) {
    return (
      <Panel title="To make">
        <p className="px-5 py-6 text-center text-sm text-neutral-400">
          Everything in the queue is in stock — nothing to make ✨
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={`To make (${rows.length} item${rows.length === 1 ? '' : 's'} · ${units} unit${units === 1 ? '' : 's'})`}>
      <Table
        head={
          <>
            <Th>Product</Th><Th right>In stock</Th><Th right>Ordered</Th><Th right>To make</Th><Th right>Action</Th>
          </>
        }
      >
        {rows.map((r) => (
          <Tr key={r.stockSku}>
            <Td>
              <div>{r.name}</div>
              <div className="font-mono text-[11px] text-neutral-400">{r.stockSku}</div>
            </Td>
            <Td right><span className={`font-semibold ${stockColor(r.onHand)}`}>{r.onHand}</span></Td>
            <Td right>{r.needed}</Td>
            <Td right><span className="font-semibold text-amber-600">{r.make}</span></Td>
            <Td right>
              {/* Made against stockSku itself — this row already IS the garment. */}
              <ProduceButton sku={r.stockSku} stockSku={r.stockSku} name={r.name} onHand={r.onHand} need={r.needed} />
            </Td>
          </Tr>
        ))}
      </Table>
    </Panel>
  );
}
