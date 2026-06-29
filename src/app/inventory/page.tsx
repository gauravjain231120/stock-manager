import { getInventoryOverview } from '@/lib/queries';
import { registerTotals } from '@/lib/register';
import { PageHeader, StatCard } from '@/components/ui';
import { InventoryTable } from '@/components/InventoryTable';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  const [{ totals, rows }, regRows] = await Promise.all([getInventoryOverview(), registerTotals()]);
  const flowBySku = new Map(regRows.map((r) => [r.sku, { shipped: r.shipped, returned: r.returned }]));
  const toMake = rows.filter((r) => r.onHand <= 0).length;
  const low = rows.filter((r) => r.onHand > 0 && r.onHand <= 5).length;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Inventory" subtitle="Current stock for each product." />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Units in stock" value={num(totals.units)} />
        <StatCard label="Products" value={totals.skus} />
        <StatCard label="To make" value={toMake} tone={toMake > 0 ? 'danger' : 'good'} hint="out of stock" />
        <StatCard label="Low (1–5)" value={low} tone={low > 0 ? 'warn' : 'default'} hint="running low" />
      </section>

      <InventoryTable
        rows={rows.map((r) => ({
          sku: r.sku,
          name: r.name,
          category: r.category,
          onHand: r.onHand,
          shipped: flowBySku.get(r.sku)?.shipped ?? 0,
          returned: flowBySku.get(r.sku)?.returned ?? 0,
        }))}
      />
    </main>
  );
}
