import { getInventoryOverview } from '@/lib/queries';
import { registerTotals } from '@/lib/register';
import { PageHeader, StatCard } from '@/components/ui';
import { InventoryTable } from '@/components/InventoryTable';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : '';
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : '';
  // A plain YYYY-MM-DD is parsed as UTC midnight — good enough for "from", but
  // "to" needs to reach the end of that calendar day to include its movements.
  const range = from || to ? { from: from ? new Date(`${from}T00:00:00.000Z`) : undefined, to: to ? new Date(`${to}T23:59:59.999Z`) : undefined } : undefined;

  const [{ totals, rows }, regRows] = await Promise.all([getInventoryOverview(), registerTotals(range)]);
  const flowBySku = new Map(regRows.map((r) => [r.sku, r]));
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
        dateFrom={from}
        dateTo={to}
        rows={rows.map((r) => {
          const flow = flowBySku.get(r.sku);
          return {
            sku: r.sku,
            name: r.name,
            category: r.category,
            onHand: r.onHand,
            available: r.available,
            shipped: flow?.shipped ?? 0,
            returned: flow?.returned ?? 0,
            color: flow?.color,
            size: flow?.size,
            sharedStock: flow?.sharedStock,
          };
        })}
      />
    </main>
  );
}
