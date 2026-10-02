import { getProduceList } from '@/lib/register';
import { PageHeader, Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProducePage() {
  const produce = await getProduceList();
  const outCount = produce.filter((p) => p.inStock <= 0).length;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Produce" subtitle="Your best-selling sizes that are now low or out of stock — make these first." />

      <Panel title={`To produce (${produce.length}) — ${outCount} out of stock`}>
        <Table
          head={<><Th>Product / Size</Th><Th right>Shipped (All Time)</Th><Th right>Sold (30d)</Th><Th right>In stock</Th><Th right>Status</Th><Th right>Make ~</Th></>}
          empty={produce.length === 0}
        >
          {produce.map((p) => {
            const out = p.inStock <= 0;
            return (
              <Tr key={p.sku}>
                <Td>{p.name}</Td>
                <Td right className="text-neutral-500">{num(p.shipped)}</Td>
                <Td right className="font-medium text-brand-700 dark:text-brand-400">{num(p.sold30d || 0)}</Td>
                <Td right>{p.inStock}</Td>
                <Td right><Badge tone={out ? 'danger' : 'warn'}>{out ? 'Out of stock' : 'Low'}</Badge></Td>
                <Td right><span className="font-bold text-brand-600">{p.suggest}</span></Td>
              </Tr>
            );
          })}
        </Table>
      </Panel>

      <p className="mt-3 px-1 text-xs text-neutral-400">
        Only variants you&apos;ve actually sold that are now low (≤5) or out of stock, sorted by highest 30-day velocity.
        &ldquo;Make ~&rdquo; is a realistic production target calculated to cover the next 30 days of sales based on recent demand.
      </p>
    </main>
  );
}
