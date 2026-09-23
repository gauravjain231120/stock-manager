import { listMovementRows, movementStats, rowsForViewer } from '@/lib/movements';
import { listReturnReports } from '@/lib/returnReports';
import { listProductOptions } from '@/lib/products';
import { registerTotals } from '@/lib/register';
import { getCurrentSession } from '@/lib/auth';
import { MovementType, PLATFORM_LABELS, Platform } from '@/lib/constants';
import { PageHeader, StatCard } from '@/components/ui';
import { MovementTable } from '@/components/MovementTable';
import { MovementDayPanel } from '@/components/MovementDayPanel';
import { ReturnReports } from '@/components/ReturnReports';
import { QuickReturnCheck } from '@/components/QuickReturnCheck';
import { ReturnSearch } from '@/components/ReturnSearch';
import { RegisterEntryForm } from '@/components/RegisterEntryForm';
import { RevealableStats } from '@/components/RevealableStats';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReturnsPage() {
  const [allRows, stats, reports, products, registerRows, session] = await Promise.all([
    listMovementRows(MovementType.RETURNED),
    movementStats(MovementType.RETURNED),
    listReturnReports(),
    listProductOptions(),
    registerTotals(),
    getCurrentSession(),
  ]);
  const outstanding = reports.reduce((a, r) => a + r.missing, 0);
  const isOwner = session?.role === 'OWNER';
  // Return type + Faked/Used are Owner-only — stripped server-side for anyone else.
  const rows = rowsForViewer(allRows, isOwner);

  // Returned units per platform, busiest first.
  const perPlatform = new Map<string, { units: number; count: number }>();
  for (const r of rows) {
    const key = r.channel ?? '';
    const e = perPlatform.get(key) ?? { units: 0, count: 0 };
    e.units += r.qty;
    e.count += 1;
    perPlatform.set(key, e);
  }
  const platformStats = [...perPlatform.entries()].sort((a, b) => b[1].units - a[1].units);

  // How every graded return came back — Owner only, since this is a quality/
  // fraud signal rather than a day-to-day operating number.
  const conditionCounts = { GOOD: 0, USED: 0, FAKED: 0, WRONG: 0 };
  const returnTypeCounts = { CUSTOMER: 0, RTO: 0, UNKNOWN: 0 };
  for (const r of rows) {
    if (r.condition && r.condition in conditionCounts) {
      conditionCounts[r.condition as keyof typeof conditionCounts] += 1;
    }
    const t = (r.returnType ?? 'UNKNOWN') as keyof typeof returnTypeCounts;
    if (t in returnTypeCounts) returnTypeCounts[t] += 1;
  }

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Returns" subtitle="Everything that has come back, with its tracking number." />

      <div className="mb-6">
        <RegisterEntryForm
          lockedAction="RETURN"
          showReturnType={isOwner}
          products={registerRows.map((r) => ({
            sku: r.sku,
            name: r.name,
            inStock: r.inStock,
            groupCode: r.groupCode,
            groupName: r.groupName,
            category: r.category,
            color: r.color,
            size: r.size,
            imageUrl: r.imageUrl,
          }))}
        />
      </div>

      <div className="mb-6">
        <ReturnSearch rows={rows} reports={reports} />
      </div>

      <RevealableStats className="mb-6">
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Returns" value={num(stats.count)} />
          <StatCard label="Units returned" value={num(stats.units)} tone={stats.units ? 'warn' : 'default'} />
          <StatCard label="Last 30 days" value={num(stats.last30Units)} hint={`${stats.last30Count} returns`} />
          <StatCard
            label="Not received"
            value={num(outstanding)}
            tone={outstanding ? 'danger' : 'good'}
            hint="on platform reports"
          />
        </section>

        {platformStats.length > 0 ? (
          <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {platformStats.map(([channel, s]) => (
              <StatCard
                key={channel || 'none'}
                label={channel ? PLATFORM_LABELS[channel as Platform] ?? channel : 'No platform'}
                value={num(s.units)}
                hint={`${s.count} return${s.count === 1 ? '' : 's'}`}
              />
            ))}
          </section>
        ) : null}

        {isOwner ? (
          <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Good" value={num(conditionCounts.GOOD)} tone="good" />
            <StatCard label="Used" value={num(conditionCounts.USED)} tone="warn" />
            <StatCard label="Faked" value={num(conditionCounts.FAKED)} tone="danger" />
            <StatCard label="Wrong" value={num(conditionCounts.WRONG)} tone="danger" />
          </section>
        ) : null}

        {isOwner ? (
          <section className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Customer returns" value={num(returnTypeCounts.CUSTOMER)} />
            <StatCard label="RTO" value={num(returnTypeCounts.RTO)} tone="warn" />
            <StatCard label="Type unknown" value={num(returnTypeCounts.UNKNOWN)} />
          </section>
        ) : null}
      </RevealableStats>

      <div className="mb-6">
        <MovementDayPanel rows={rows} today={stats.today} title="Returned on a day" verb="returned" />
      </div>

      <div className="mb-6">
        <QuickReturnCheck />
      </div>

      <div className="mb-6">
        <ReturnReports reports={reports} today={stats.today} />
      </div>

      <MovementTable
        rows={rows}
        title="Returns"
        dateLabel="Returned"
        verb="returned"
        csvName="returns"
        withCondition
        showConditionFilter={isOwner}
        ownerView={isOwner}
        products={products}
      />
    </main>
  );
}
