import { getInventoryOverview } from '@/lib/queries';
import { getProduceList } from '@/lib/register';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { InventoryTable } from '@/components/InventoryTable';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const [{ totals, rows }, produce] = await Promise.all([getInventoryOverview(), getProduceList()]);
  const toMake = rows.filter((r) => r.onHand <= 0).length;
  const low = rows.filter((r) => r.onHand > 0 && r.onHand <= 5).length;

  return (
    <main className="px-6 py-8">
      <PageHeader title="Inventory" subtitle="Current stock for each product." />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Units in stock" value={num(totals.units)} />
        <StatCard label="Products" value={totals.skus} />
        <StatCard label="To make" value={toMake} tone={toMake > 0 ? 'danger' : 'good'} hint="out of stock" />
        <StatCard label="Low (1–5)" value={low} tone={low > 0 ? 'warn' : 'default'} hint="running low" />
      </section>

      <InventoryTable rows={rows.map((r) => ({ sku: r.sku, name: r.name, category: r.category, onHand: r.onHand }))} />

      <section className="mt-8">
        <Panel title={`🏭 Produce next — best-sellers running low (${produce.length})`}>
          <Table
            head={<><Th>Product / Size</Th><Th right>Shipped</Th><Th right>In stock</Th><Th right>Status</Th><Th right>Make ~</Th></>}
            empty={produce.length === 0}
          >
            {produce.map((p) => {
              const out = p.inStock <= 0;
              return (
                <Tr key={p.sku}>
                  <Td>{p.name}</Td>
                  <Td right>{num(p.shipped)}</Td>
                  <Td right>{p.inStock}</Td>
                  <Td right><Badge tone={out ? 'danger' : 'warn'}>{out ? 'Out of stock' : 'Low'}</Badge></Td>
                  <Td right><span className="font-semibold text-brand-600">{p.suggest}</span></Td>
                </Tr>
              );
            })}
          </Table>
        </Panel>
        <p className="mt-2 px-1 text-xs text-neutral-400">
          Items you&apos;ve sold that are now low or out of stock, most-shipped first. &ldquo;Make ~&rdquo; is a rough quantity to cover the demand already seen.
        </p>
      </section>
    </main>
  );
}
