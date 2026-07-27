import { listShipped, shippedStats } from '@/lib/shipping';
import { PageHeader, StatCard } from '@/components/ui';
import { ShippedTable } from '@/components/ShippedTable';
import { ShippedDayPanel } from '@/components/ShippedDayPanel';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ShippedPage() {
  const [rows, stats] = await Promise.all([listShipped(), shippedStats()]);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Shipped" subtitle="Everything that has gone out, with its tracking number." />

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Shipments" value={num(stats.shipments)} />
        <StatCard label="Units shipped" value={num(stats.units)} />
        <StatCard label="Last 30 days" value={num(stats.last30Units)} hint={`${stats.last30Shipments} shipments`} />
        <StatCard label="With tracking" value={num(stats.tracked)} hint={`${stats.untracked} without`} />
      </section>

      <div className="mb-6">
        <ShippedDayPanel rows={rows} today={stats.today} />
      </div>

      <ShippedTable rows={rows} />
    </main>
  );
}
