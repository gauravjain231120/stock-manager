import { listPending, shipProducts } from '@/lib/shipping';
import { PageHeader, Panel, Table, Th, Td, Tr, StatCard, Badge } from '@/components/ui';
import { AddPendingForm } from '@/components/AddPendingForm';
import { ActionButton } from '@/components/ActionButton';
import { ShipButton } from '@/components/ShipButton';
import { num } from '@/lib/format';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';

export const dynamic = 'force-dynamic';

function platformLabel(c?: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

function stockStatus(n: number) {
  if (n <= 0) return { label: 'Out of stock', tone: 'danger' as const, color: 'text-red-600' };
  if (n <= 5) return { label: 'Low', tone: 'warn' as const, color: 'text-amber-600' };
  return { label: 'Good', tone: 'good' as const, color: 'text-emerald-600' };
}

export default async function ShipPage() {
  const [pending, products] = await Promise.all([listPending(), shipProducts()]);
  const units = pending.reduce((a, p) => a + p.qty, 0);
  // Total queued units per product — a product can appear on >1 row (different platforms),
  // so "After ship" reflects what's left once ALL its queued units ship, not just this row's.
  const queuedBySku = new Map<string, number>();
  for (const p of pending) queuedBySku.set(p.sku, (queuedBySku.get(p.sku) ?? 0) + p.qty);
  const anyShort = pending.some((p) => (queuedBySku.get(p.sku) ?? 0) > p.onHand);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
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
              disabled={anyShort}
              title={anyShort ? 'Some items are out of stock — produce them or remove them first' : undefined}
            />
          ) : null
        }
      >
        <Table head={<><Th>Product</Th><Th>Platform</Th><Th right>Stock</Th><Th right>Status</Th><Th right>Qty</Th><Th right>After ship</Th><Th right>Action</Th></>} empty={pending.length === 0}>
          {pending.map((p) => {
            const s = stockStatus(p.onHand);
            const after = p.onHand - (queuedBySku.get(p.sku) ?? p.qty);
            return (
            <Tr key={p.id}>
              <Td>
                <div>{p.name}</div>
                <div className="font-mono text-[11px] text-neutral-400">{p.sku}</div>
              </Td>
              <Td>{platformLabel(p.channel)}</Td>
              <Td right><span className={`font-semibold ${s.color}`}>{p.onHand}</span></Td>
              <Td right><Badge tone={s.tone}>{s.label}</Badge></Td>
              <Td right>{p.qty}</Td>
              <Td right><span className={`font-semibold ${stockStatus(after).color}`}>{after}</span></Td>
              <Td right>
                <span className="inline-flex gap-2">
                  <ShipButton id={p.id} name={p.name} sku={p.sku} qty={p.qty} stock={p.onHand} />
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
            );
          })}
        </Table>
      </Panel>

      {pending.length === 0 ? (
        <p className="mt-3 px-1 text-xs text-neutral-400">Nothing to pack right now. Add an order above as soon as it comes in. ✨</p>
      ) : null}
    </main>
  );
}
