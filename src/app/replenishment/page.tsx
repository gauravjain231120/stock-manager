import { replenishmentSuggestions } from '@/lib/replenishment';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReplenishmentPage() {
  const rows = await replenishmentSuggestions(30);
  const needing = rows.filter((r) => r.needsReorder);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Replenishment"
        subtitle="What to produce next. Reorder point = avg daily sales × lead time + safety stock (last 30 days of sales)."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Needs reorder" value={needing.length} tone={needing.length > 0 ? 'danger' : 'good'} />
        <StatCard label="Suggested units" value={num(needing.reduce((a, r) => a + r.suggestedQty, 0))} hint="to produce" />
        <StatCard label="SKUs tracked" value={rows.length} />
      </section>

      <Panel title="Reorder suggestions (most urgent first)">
        <Table
          head={<><Th>SKU</Th><Th>Name</Th><Th right>Available</Th><Th right>Avg/day</Th><Th right>Cover</Th><Th right>Reorder pt</Th><Th right>Produce</Th></>}
          empty={rows.length === 0}
        >
          {rows.map((r) => (
            <Tr key={r.sku}>
              <Td mono>{r.sku}</Td>
              <Td>{r.name}</Td>
              <Td right>{num(r.available)}</Td>
              <Td right>{r.avgDailySales}</Td>
              <Td right>{r.daysOfCover == null ? '—' : `${r.daysOfCover}d`}</Td>
              <Td right>{num(r.reorderPoint)}</Td>
              <Td right>{r.needsReorder ? <Badge tone="danger">{num(r.suggestedQty)}</Badge> : <span className="text-neutral-400">ok</span>}</Td>
            </Tr>
          ))}
        </Table>
      </Panel>
    </main>
  );
}
