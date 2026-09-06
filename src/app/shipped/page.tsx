import { listMovementRows, movementStats } from '@/lib/movements';
import { MovementType } from '@/lib/constants';
import { PageHeader, StatCard } from '@/components/ui';
import { MovementTable } from '@/components/MovementTable';
import { MovementDayPanel } from '@/components/MovementDayPanel';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ShippedPage() {
  const [rows, stats, returnRows] = await Promise.all([
    listMovementRows(MovementType.SOLD),
    movementStats(MovementType.SOLD),
    // So the table's totals can say how much of the same slice came back.
    listMovementRows(MovementType.RETURNED),
  ]);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Shipped" subtitle="Everything that has gone out, with its tracking number." />

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Orders shipped" value={num(stats.orderCount)} hint={`${num(stats.count)} rows`} />
        <StatCard label="Units shipped" value={num(stats.units)} />
        <StatCard label="Last 30 days" value={num(stats.last30Units)} hint={`${stats.last30OrderCount} orders`} />
        <StatCard label="With tracking" value={num(stats.tracked)} hint={`${stats.untracked} without`} />
      </section>

      <div className="mb-6">
        <MovementDayPanel rows={rows} today={stats.today} title="Shipped on a day" verb="shipped" />
      </div>

      <MovementTable rows={rows} title="Shipped" dateLabel="Shipped" verb="shipped" csvName="shipped" returnRows={returnRows} allowMoveToQueue />
    </main>
  );
}
