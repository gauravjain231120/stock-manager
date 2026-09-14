import Link from 'next/link';
import { PackageCheck, AlertTriangle, TrendingUp, Undo2, Wallet, Boxes, Flame } from 'lucide-react';
import { getInventoryOverview } from '@/lib/queries';
import { replenishmentSuggestions } from '@/lib/replenishment';
import { listNotes } from '@/lib/notes';
import { listPending } from '@/lib/shipping';
import { getOpenPeriodWithEntries } from '@/lib/accounts';
import { listReturns } from '@/lib/returns';
import { reportBundle, dailySoldTrend } from '@/lib/reports';
import { getCurrentSession } from '@/lib/auth';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, Badge, TrendBars } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { num, inr, dateOnly } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const [{ totals, rows }, repl, notes, pending, period, returnsToGrade, report, trend, session] = await Promise.all([
    getInventoryOverview(),
    replenishmentSuggestions(30),
    listNotes(),
    listPending(),
    getOpenPeriodWithEntries(),
    listReturns('RECEIVED'),
    reportBundle(30),
    dailySoldTrend(14),
    getCurrentSession(),
  ]);

  const isOwner = session?.role === 'OWNER';
  const needsReorder = repl.filter((r) => r.needsReorder);
  const now = Date.now();
  const overdue = pending.filter((p) => p.shipByAt && new Date(p.shipByAt).getTime() < now);
  const urgentQueue = [...pending]
    .sort((a, b) => {
      if (!a.shipByAt) return 1;
      if (!b.shipByAt) return -1;
      return new Date(a.shipByAt).getTime() - new Date(b.shipByAt).getTime();
    })
    .slice(0, 6);

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

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={PackageCheck}
          label="Ready to Ship"
          value={num(pending.length)}
          hint={overdue.length > 0 ? `${overdue.length} overdue` : 'on track'}
          tone={overdue.length > 0 ? 'danger' : 'default'}
        />
        <StatCard icon={Boxes} label="Stock on hand" value={num(totals.units)} hint="sellable units" />
        <StatCard
          icon={AlertTriangle}
          label="Needs reorder"
          value={needsReorder.length}
          tone={needsReorder.length > 0 ? 'danger' : 'good'}
          hint="below reorder point"
        />
        <StatCard icon={TrendingUp} label="Units sold" value={num(report.totals.sold)} hint={`last ${report.windowDays}d`} />
        <StatCard
          icon={Undo2}
          label="Returns to grade"
          value={returnsToGrade.length}
          tone={returnsToGrade.length > 0 ? 'warn' : 'good'}
          hint="awaiting grading"
        />
        <StatCard
          icon={Wallet}
          label="Expense (this cycle)"
          value={inr(period.totals.expense)}
          hint={`net ${inr(period.totals.net)}`}
          tone={period.totals.net < 0 ? 'danger' : 'default'}
        />
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
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

        <Panel
          title={`Needs reorder (${needsReorder.length})`}
          actions={<Link href="/replenishment" className="text-xs text-neutral-500 hover:underline">Open →</Link>}
        >
          <Table head={<><Th>SKU</Th><Th right>On hand</Th><Th right>Days left</Th><Th right>Suggest</Th></>} empty={needsReorder.length === 0}>
            {needsReorder.slice(0, 6).map((r) => (
              <Tr key={r.sku}>
                <Td mono>{r.sku}</Td>
                <Td right>{r.onHand}</Td>
                <Td right>
                  <Badge tone={r.daysOfCover !== null && r.daysOfCover <= 3 ? 'danger' : 'warn'}>
                    {r.daysOfCover === null ? '—' : `${r.daysOfCover}d`}
                  </Badge>
                </Td>
                <Td right>{r.suggestedQty}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`Units sold — last ${trend.length} days`}>
          <div className="px-5 py-4">
            <TrendBars data={trend} />
          </div>
        </Panel>

        <Panel title={`Fast movers — last ${report.windowDays}d`} actions={<Link href="/reports" className="text-xs text-neutral-500 hover:underline">Full report →</Link>}>
          <Table head={<><Th>SKU</Th><Th right>Sold</Th></>} empty={report.fastMovers.length === 0}>
            {report.fastMovers.map((m) => (
              <Tr key={m.sku}>
                <Td mono className="flex items-center gap-1.5">
                  <Flame size={12} className="shrink-0 text-orange-500" />
                  {m.sku}
                </Td>
                <Td right>{num(m.sold)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={`Inventory (${rows.length} SKUs)`}
          actions={<Link href="/inventory" className="text-xs text-neutral-500 hover:underline">View all →</Link>}
        >
          <Table head={<><Th>SKU</Th><Th>Name</Th><Th right>On hand</Th><Th right>Available</Th></>} empty={rows.length === 0}>
            {rows.slice(0, 6).map((r) => (
              <Tr key={r.sku}>
                <Td mono>{r.sku}</Td>
                <Td>{r.name}</Td>
                <Td right>{r.onHand}</Td>
                <Td right>{r.available}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>

        <Panel title={`Notes (${notes.length})`} actions={<Link href="/notes" className="text-xs text-neutral-500 hover:underline">Open →</Link>}>
          {notes.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-neutral-400">No notes yet.</div>
          ) : (
            <ul className="divide-y divide-black/5 dark:divide-white/5">
              {notes.slice(0, 5).map((n) => (
                <li key={n.id} className="px-5 py-2">
                  <div className="text-sm font-medium">{n.title.trim() || 'Untitled note'}</div>
                  <div className="truncate text-xs text-neutral-400">{n.text.trim() || '(empty)'}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}
