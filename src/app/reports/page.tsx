import { reportBundle } from '@/lib/reports';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr } from '@/components/ui';
import { inr, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const r = await reportBundle(30);

  return (
    <main className="px-6 py-8">
      <PageHeader title="Reports" subtitle={`Last ${r.windowDays} days.`} />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Revenue" value={inr(r.totals.revenue)} />
        <StatCard label="Orders" value={num(r.totals.orders)} />
        <StatCard label="Units sold" value={num(r.totals.sold)} />
        <StatCard label="Returns" value={num(r.totals.returned)} tone={r.totals.returned > 0 ? 'warn' : 'default'} />
        <StatCard label="Return rate" value={`${r.returnRatePct}%`} tone={r.returnRatePct > 10 ? 'danger' : 'good'} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Sales by channel">
          <Table head={<><Th>Channel</Th><Th right>Orders</Th><Th right>Units</Th><Th right>Revenue</Th></>} empty={r.salesByChannel.length === 0}>
            {r.salesByChannel.map((s) => (
              <Tr key={s.channel}>
                <Td>{s.channel}</Td>
                <Td right>{num(s.orders)}</Td>
                <Td right>{num(s.units)}</Td>
                <Td right>{inr(s.revenue)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>

        <Panel title="Damaged stock">
          <Table head={<><Th>SKU</Th><Th right>Qty</Th></>} empty={r.damagedBySku.length === 0}>
            {r.damagedBySku.map((d) => (
              <Tr key={d.sku}><Td mono>{d.sku}</Td><Td right>{num(d.qty)}</Td></Tr>
            ))}
          </Table>
        </Panel>

        <Panel title="Fast movers">
          <Table head={<><Th>SKU</Th><Th right>Sold</Th></>} empty={r.fastMovers.length === 0}>
            {r.fastMovers.map((m) => (
              <Tr key={m.sku}><Td mono>{m.sku}</Td><Td right>{num(m.sold)}</Td></Tr>
            ))}
          </Table>
        </Panel>

        <Panel title="Slow movers">
          <Table head={<><Th>SKU</Th><Th right>Sold</Th></>} empty={r.slowMovers.length === 0}>
            {r.slowMovers.map((m) => (
              <Tr key={m.sku}><Td mono>{m.sku}</Td><Td right>{num(m.sold)}</Td></Tr>
            ))}
          </Table>
        </Panel>
      </div>
    </main>
  );
}
