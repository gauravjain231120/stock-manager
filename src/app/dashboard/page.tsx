import Link from 'next/link';
import { getInventoryOverview } from '@/lib/queries';
import { replenishmentSuggestions } from '@/lib/replenishment';
import { getNote } from '@/lib/notes';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { NotesPanel } from '@/components/NotesPanel';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const [{ summary, totals, rows }, repl, note] = await Promise.all([
    getInventoryOverview(),
    replenishmentSuggestions(30),
    getNote(),
  ]);
  const needsReorder = repl.filter((r) => r.needsReorder).length;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Dashboard"
        subtitle="One trustworthy stock number, straight from the immutable ledger."
        actions={
          <>
            <ActionButton label="Simulate sales" endpoint="/api/orders/simulate" body={{ count: 5 }} successMessage="orders queued" />
            <ActionButton label="Process orders" endpoint="/api/orders/ingest" variant="primary" successMessage="processed ✓" />
            <ActionButton label="Sync stock" endpoint="/api/sync" successMessage="synced ✓" />
          </>
        }
      />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Stock on hand" value={num(totals.units)} hint="sellable units" />
        <StatCard label="SKUs" value={totals.skus} hint="active products" />
        <StatCard label="Produced" value={num(summary.made)} hint="all-time" />
        <StatCard label="Sold" value={num(summary.sold)} hint="units shipped" />
        <StatCard label="Returns" value={num(summary.returned)} hint={`${totals.damaged} damaged`} tone={summary.returned > 0 ? 'warn' : 'default'} />
        <StatCard label="Needs reorder" value={needsReorder} tone={needsReorder > 0 ? 'danger' : 'good'} hint="below reorder point" />
      </section>

      <Panel
        title={`Inventory (${rows.length} SKUs)`}
        actions={<Link href="/inventory" className="text-xs text-neutral-500 hover:underline">View all →</Link>}
      >
        <Table head={<><Th>SKU</Th><Th>Name</Th><Th right>On hand</Th><Th right>Available</Th><Th right>Channels</Th></>}>
          {rows.slice(0, 8).map((r) => (
            <Tr key={r.sku}>
              <Td mono>{r.sku}</Td>
              <Td>{r.name}</Td>
              <Td right>{r.onHand}</Td>
              <Td right>{r.available}</Td>
              <Td right>{r.channels > 0 ? r.channels : <Badge tone="warn">0</Badge>}</Td>
            </Tr>
          ))}
        </Table>
      </Panel>

      <div className="mt-8">
        <NotesPanel initialText={note} />
      </div>
    </main>
  );
}
