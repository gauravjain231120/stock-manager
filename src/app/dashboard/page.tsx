import Link from 'next/link';
import { Undo2, Wallet, Boxes, TrendingUp, Flame } from 'lucide-react';
import { getInventoryOverview } from '@/lib/queries';
import { listPending } from '@/lib/shipping';
import { getOpenPeriodWithEntries } from '@/lib/accounts';
import { listReturnShipments } from '@/lib/returnShipments';
import { reportBundle, dailySoldTrend, dailyReturnedTrend } from '@/lib/reports';
import { getCurrentSession } from '@/lib/auth';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, TrendBars } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { num, inr, dateOnly } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const [{ totals, rows }, pending, period, returns, report, soldTrend, returnedTrend, session] = await Promise.all([
    getInventoryOverview(),
    listPending(),
    getOpenPeriodWithEntries(),
    listReturnShipments(200),
    reportBundle(30),
    dailySoldTrend(14),
    dailyReturnedTrend(14),
    getCurrentSession(),
  ]);

  const isOwner = session?.role === 'OWNER';
  const now = Date.now();
  const urgentQueue = [...pending]
    .sort((a, b) => {
      if (!a.shipByAt) return 1;
      if (!b.shipByAt) return -1;
      return new Date(a.shipByAt).getTime() - new Date(b.shipByAt).getTime();
    })
    .slice(0, 6);

  const expectedReturns = returns.filter((r) => r.status === 'EXPECTED').sort((a, b) => b.waitingDays - a.waitingDays);
  const overdueReturns = expectedReturns.filter((r) => r.overdue);

  // Name/category for whichever SKUs turn up in the fast movers table below —
  // reused from the inventory read already happening for "Stock on hand".
  const productBySku = new Map(rows.map((r) => [r.sku, r]));

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Dashboard"
        subtitle="Your business at a glance — straight from the immutable ledger."
        // Bulk test/data tools, not "insights" — stay Owner-only regardless of
        // who else is granted this section, same as before this page had a
        // permission system at all.
        actions={
          isOwner ? (
            <>
              <ActionButton label="Simulate sales" endpoint="/api/orders/simulate" body={{ count: 5 }} successMessage="orders queued" />
              <ActionButton label="Process orders" endpoint="/api/orders/ingest" variant="primary" successMessage="processed ✓" />
              <ActionButton label="Sync stock" endpoint="/api/sync" successMessage="synced ✓" />
            </>
          ) : undefined
        }
      />

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Boxes} label="Stock on hand" value={num(totals.units)} hint="sellable units" />
        <StatCard icon={TrendingUp} label="Units sold" value={num(report.totals.sold)} hint={`last ${report.windowDays}d`} />
        <StatCard
          icon={Undo2}
          label="Returns pending"
          value={expectedReturns.length}
          hint={overdueReturns.length > 0 ? `${overdueReturns.length} overdue` : 'on the way'}
          tone={overdueReturns.length > 0 ? 'danger' : expectedReturns.length > 0 ? 'warn' : 'good'}
        />
        <StatCard
          icon={Wallet}
          label="Expense (this cycle)"
          value={inr(period.totals.expense)}
          hint={`net ${inr(period.totals.net)}`}
          tone={period.totals.net < 0 ? 'danger' : 'default'}
        />
      </section>

      <div className="mb-6">
        <Panel
          title={`Ready to Ship — urgent (${pending.length})`}
          actions={<Link href="/ship" className="text-xs text-neutral-500 hover:underline">Open →</Link>}
        >
          <Table head={<><Th>Order</Th><Th>SKU</Th><Th right>Qty</Th><Th right>Ship by</Th></>} empty={urgentQueue.length === 0}>
            {urgentQueue.map((p) => {
              const isOverdue = p.shipByAt ? new Date(p.shipByAt).getTime() < now : false;
              return (
                <Tr key={p.id}>
                  <Td mono>{p.orderId || '—'}</Td>
                  <Td mono>{p.sku}</Td>
                  <Td right>{p.qty}</Td>
                  <Td right>
                    {p.shipByAt ? <span className={isOverdue ? 'font-medium text-red-500' : ''}>{dateOnly(p.shipByAt)}</span> : '—'}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`Units sold — last ${soldTrend.length} days`}>
          <div className="px-5 py-4">
            <TrendBars data={soldTrend} unitLabel="sold" />
          </div>
        </Panel>

        <Panel title={`Returns — last ${returnedTrend.length} days`}>
          <div className="px-5 py-4">
            <TrendBars data={returnedTrend} tone="warn" unitLabel="returned" />
          </div>
        </Panel>
      </div>

      <Panel title={`Fast movers — last ${report.windowDays}d`} actions={<Link href="/reports" className="text-xs text-neutral-500 hover:underline">Full report →</Link>}>
        <Table head={<><Th>SKU</Th><Th>Name</Th><Th>Category</Th><Th right>Sold</Th></>} empty={report.fastMovers.length === 0}>
          {report.fastMovers.map((m) => {
            const product = productBySku.get(m.sku);
            return (
              <Tr key={m.sku}>
                <Td mono className="flex items-center gap-1.5">
                  <Flame size={12} className="shrink-0 text-orange-500" />
                  {m.sku}
                </Td>
                <Td>{product?.name ?? '—'}</Td>
                <Td>{product?.category || '—'}</Td>
                <Td right>{num(m.sold)}</Td>
              </Tr>
            );
          })}
        </Table>
      </Panel>
    </main>
  );
}
