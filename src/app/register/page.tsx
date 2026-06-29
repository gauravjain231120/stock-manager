import { registerTotals, recentEntries, channelBreakdown } from '@/lib/register';
import { PageHeader, Panel, Table, Th, Td, Tr, StatCard } from '@/components/ui';
import { RegisterEntryForm } from '@/components/RegisterEntryForm';
import { RecentEntriesTable } from '@/components/RecentEntriesTable';
import { num } from '@/lib/format';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';

export const dynamic = 'force-dynamic';

function platformLabel(channel?: string | null) {
  if (!channel) return '—';
  return PLATFORM_LABELS[channel as Platform] ?? channel;
}

export default async function RegisterPage() {
  const [rows, recent, byPlatform] = await Promise.all([registerTotals(), recentEntries(1000), channelBreakdown()]);
  const totals = rows.reduce(
    (a, r) => ({
      produced: a.produced + r.produced,
      shipped: a.shipped + r.shipped,
      returned: a.returned + r.returned,
      inStock: a.inStock + r.inStock,
    }),
    { produced: 0, shipped: 0, returned: 0, inStock: 0 },
  );

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Stock Log" subtitle="The simple way: pick a product, choose Produce / Ship / Return, enter a quantity." />

      <div className="mb-6">
        <RegisterEntryForm products={rows.map((r) => ({ sku: r.sku, name: r.name, inStock: r.inStock }))} />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="In stock" value={num(totals.inStock)} />
        <StatCard label="Produced" value={num(totals.produced)} tone="good" />
        <StatCard label="Shipped" value={num(totals.shipped)} />
        <StatCard label="Returned" value={num(totals.returned)} tone={totals.returned ? 'warn' : 'default'} />
      </section>

      {byPlatform.length > 0 ? (
        <div className="mt-6">
          <Panel title="Shipped by platform">
            <Table head={<><Th>Platform</Th><Th right>Shipped</Th><Th right>Returned</Th></>}>
              {byPlatform.map((p) => (
                <Tr key={p.channel}>
                  <Td>{platformLabel(p.channel)}</Td>
                  <Td right>{num(p.shipped)}</Td>
                  <Td right>{num(p.returned)}</Td>
                </Tr>
              ))}
            </Table>
          </Panel>
        </div>
      ) : null}

      <div className="mt-6">
        <RecentEntriesTable
          entries={recent.map((m) => ({
            id: String(m._id),
            createdAt: (m.createdAt as unknown as Date).toISOString(),
            type: m.type,
            sku: m.sku,
            qty: m.qty,
            channel: m.channel ?? null,
          }))}
        />
      </div>
    </main>
  );
}
