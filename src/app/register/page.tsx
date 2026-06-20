import { registerTotals, recentEntries, channelBreakdown } from '@/lib/register';
import { PageHeader, Panel, Table, Th, Td, Tr, StatCard } from '@/components/ui';
import { RegisterEntryForm } from '@/components/RegisterEntryForm';
import { RecentEntriesTable } from '@/components/RecentEntriesTable';
import { EditableStock } from '@/components/EditableStock';
import { num, compareVariant, groupVariants } from '@/lib/format';
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
    <main className="px-6 py-8">
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

      <h2 className="mb-3 text-sm font-medium text-neutral-500">Per product ({rows.length})</h2>
      <div className="space-y-4">
        {groupVariants([...rows].sort((a, b) => compareVariant(a.sku, b.sku)), (r) => r.sku.split('-').pop() ?? '').map((g) => {
          const groupStock = g.rows.reduce((a, r) => a + r.inStock, 0);
          return (
            <Panel key={g.key} title={g.title} actions={<span className="text-xs text-neutral-400">{num(groupStock)} in stock</span>}>
              <Table head={<><Th>Size</Th><Th right>Produced</Th><Th right>Shipped</Th><Th right>Returned</Th><Th right>In stock</Th></>}>
                {g.rows.map((r) => (
                  <Tr key={r.sku}>
                    <Td>{r.sku.split('-').pop()}</Td>
                    <Td right>{num(r.produced)}</Td>
                    <Td right>{num(r.shipped)}</Td>
                    <Td right>{num(r.returned)}</Td>
                    <Td right><EditableStock sku={r.sku} value={r.inStock} /></Td>
                  </Tr>
                ))}
              </Table>
            </Panel>
          );
        })}
      </div>

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
