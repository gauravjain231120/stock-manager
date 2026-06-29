import { listOrders } from '@/lib/orders';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const orders = await listOrders(100);
  const needsStock = orders.filter((o) => o.status === 'NEEDS_STOCK').length;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Orders"
        subtitle="Orders pulled from each channel. Every fulfilled line posts a SOLD movement and resyncs stock."
        actions={
          <>
            <ActionButton label="Simulate sales" endpoint="/api/orders/simulate" body={{ count: 5 }} successMessage="queued ✓" />
            <ActionButton label="Process orders" endpoint="/api/orders/ingest" variant="primary" successMessage="processed ✓" />
          </>
        }
      />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Orders" value={orders.length} hint="recent" />
        <StatCard label="Fulfilled" value={orders.filter((o) => o.status === 'FULFILLED').length} tone="good" />
        <StatCard label="Needs stock" value={needsStock} tone={needsStock > 0 ? 'danger' : 'good'} hint="oversold / unmapped" />
      </section>

      <Panel title={`Recent orders (${orders.length})`}>
        <Table head={<><Th>When</Th><Th>Channel</Th><Th>Order ID</Th><Th>Items</Th><Th right>Status</Th></>} empty={orders.length === 0}>
          {orders.map((o) => (
            <Tr key={String(o._id)}>
              <Td>{dateTime(o.placedAt as unknown as Date)}</Td>
              <Td>{o.channel}</Td>
              <Td mono>{o.channelOrderId}</Td>
              <Td>
                {o.lines.map((l, i) => (
                  <span key={i} className="mr-2 inline-block">
                    {l.channelSku} ×{l.qty}
                    {l.issue ? <> <Badge tone="danger">{l.issue === 'UNMAPPED' ? 'unmapped' : 'no stock'}</Badge></> : null}
                  </span>
                ))}
              </Td>
              <Td right>
                {o.status === 'FULFILLED' ? <Badge tone="good">fulfilled</Badge> : <Badge tone="danger">needs stock</Badge>}
              </Td>
            </Tr>
          ))}
        </Table>
      </Panel>
    </main>
  );
}
