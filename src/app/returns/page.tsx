import { listMovementRows, movementStats } from '@/lib/movements';
import { MovementType } from '@/lib/constants';
import { PageHeader, StatCard } from '@/components/ui';
import { MovementTable } from '@/components/MovementTable';
import { MovementDayPanel } from '@/components/MovementDayPanel';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReturnsPage() {
  const [rows, stats] = await Promise.all([
    listMovementRows(MovementType.RETURNED),
    movementStats(MovementType.RETURNED),
  ]);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Returns" subtitle="Everything that has come back, with its tracking number. Log a return from the Stock Log." />

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Returns" value={num(stats.count)} />
        <StatCard label="Units returned" value={num(stats.units)} tone={stats.units ? 'warn' : 'default'} />
        <StatCard label="Last 30 days" value={num(stats.last30Units)} hint={`${stats.last30Count} returns`} />
        <StatCard label="With tracking" value={num(stats.tracked)} hint={`${stats.untracked} without`} />
      </section>

      <div className="mb-6">
        <MovementDayPanel rows={rows} today={stats.today} title="Returned on a day" verb="returned" />
      </div>

      <MovementTable rows={rows} title="Returns" dateLabel="Returned" />
    </main>
  );
}
