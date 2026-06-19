import { listReturns } from '@/lib/returns';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReturnsPage() {
  const returns = await listReturns(undefined, 100);
  const pending = returns.filter((r) => r.status === 'RECEIVED');
  const damaged = returns.filter((r) => r.grade === 'DAMAGED').length;

  return (
    <main className="px-6 py-8">
      <PageHeader
        title="Returns"
        subtitle="Returned units land in quarantine, then you grade them sellable (back to stock) or damaged."
        actions={
          <>
            <ActionButton label="Simulate returns" endpoint="/api/returns/simulate" body={{ count: 3 }} successMessage="queued ✓" />
            <ActionButton label="Receive returns" endpoint="/api/returns/ingest" variant="primary" successMessage="received ✓" />
          </>
        }
      />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Returns" value={returns.length} hint="recent" />
        <StatCard label="Awaiting grading" value={pending.length} tone={pending.length > 0 ? 'warn' : 'good'} />
        <StatCard label="Back to sellable" value={returns.filter((r) => r.grade === 'SELLABLE').length} tone="good" />
        <StatCard label="Damaged" value={damaged} tone={damaged > 0 ? 'danger' : 'default'} />
      </section>

      <Panel title={`Returns (${returns.length})`}>
        <Table head={<><Th>When</Th><Th>Channel</Th><Th>SKU</Th><Th right>Qty</Th><Th>Reason</Th><Th right>Status / action</Th></>} empty={returns.length === 0}>
          {returns.map((r) => (
            <Tr key={String(r._id)}>
              <Td>{dateTime(r.receivedAt as unknown as Date)}</Td>
              <Td>{r.channel}</Td>
              <Td mono>{r.sku ?? r.channelSku}</Td>
              <Td right>{r.qty}</Td>
              <Td>{r.reason ?? '—'}</Td>
              <Td right>
                {r.status === 'GRADED' ? (
                  <Badge tone={r.grade === 'SELLABLE' ? 'good' : 'danger'}>{r.grade?.toLowerCase()}</Badge>
                ) : (
                  <span className="inline-flex gap-2">
                    <ActionButton label="Sellable" endpoint="/api/returns/grade" body={{ returnId: String(r._id), grade: 'SELLABLE' }} successMessage="✓" />
                    <ActionButton label="Damaged" endpoint="/api/returns/grade" body={{ returnId: String(r._id), grade: 'DAMAGED' }} variant="danger" successMessage="✓" />
                  </span>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      </Panel>
    </main>
  );
}
