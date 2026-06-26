import { listPending, shipProducts } from '@/lib/shipping';
import { PageHeader, Panel, Table, Th, Td, Tr, StatCard } from '@/components/ui';
import { AddPendingForm } from '@/components/AddPendingForm';
import { ActionButton } from '@/components/ActionButton';
import { num, dateTime } from '@/lib/format';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';

export const dynamic = 'force-dynamic';

function platformLabel(c?: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

export default async function ShipPage() {
  const [pending, products] = await Promise.all([listPending(), shipProducts()]);
  const units = pending.reduce((a, p) => a + p.qty, 0);

  return (
    <main className="px-6 py-8">
      <PageHeader title="Ready to Ship" subtitle="Add each order as it comes in; hit Ship when you pack it. Stock is reserved until shipped." />

      <div className="mb-6">
        <AddPendingForm products={products} />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard label="Orders to pack" value={pending.length} tone={pending.length ? 'warn' : 'good'} />
        <StatCard label="Units to ship" value={num(units)} />
      </section>

      <Panel
        title={`Queue (${pending.length})`}
        actions={
          pending.length > 0 ? (
            <ActionButton
              label="Ship all"
              endpoint="/api/pending/ship-all"
              method="POST"
              variant="primary"
              confirmTitle="Ship everything?"
              confirm={`All ${pending.length} item(s) will be marked shipped and their stock deducted.`}
              confirmDetails={[{ label: 'Items', value: String(pending.length) }, { label: 'Units', value: String(units) }]}
              confirmLabel="Ship all"
              successMessage="All shipped ✓"
            />
          ) : null
        }
      >
        <Table head={<><Th>Added</Th><Th>Product</Th><Th>Platform</Th><Th>Order ID</Th><Th right>Qty</Th><Th right>Action</Th></>} empty={pending.length === 0}>
          {pending.map((p) => (
            <Tr key={p.id}>
              <Td>{dateTime(p.createdAt)}</Td>
              <Td>
                <div>{p.name}</div>
                <div className="font-mono text-[11px] text-neutral-400">{p.sku}</div>
              </Td>
              <Td>{platformLabel(p.channel)}</Td>
              <Td mono>{p.orderId || '—'}</Td>
              <Td right>{p.qty}</Td>
              <Td right>
                <span className="inline-flex gap-2">
                  <ActionButton label="Ship" endpoint={`/api/pending/${p.id}`} method="POST" variant="primary" successMessage="Shipped ✓" />
                  <ActionButton
                    label="Cancel"
                    endpoint={`/api/pending/${p.id}`}
                    method="DELETE"
                    variant="secondary"
                    confirmTitle="Remove from queue?"
                    confirm="The reserved stock is released. No stock is deducted."
                    confirmDetails={[{ label: 'Product', value: p.sku }, { label: 'Qty', value: String(p.qty) }]}
                    confirmLabel="Remove"
                    successMessage="Removed"
                  />
                </span>
              </Td>
            </Tr>
          ))}
        </Table>
      </Panel>

      {pending.length === 0 ? (
        <p className="mt-3 px-1 text-xs text-neutral-400">Nothing to pack right now. Add an order above as soon as it comes in. ✨</p>
      ) : null}
    </main>
  );
}
