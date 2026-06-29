import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { ChannelListingModel } from '@/models/ChannelListing';
import { channelStates } from '@/lib/sync';
import { CHANNELS } from '@/lib/constants';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { AddListingForm } from '@/components/forms';
import { ActionButton } from '@/components/ActionButton';
import { inr, num, timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  await connectDB();
  const [products, listings, states] = await Promise.all([
    ProductModel.find({ active: true }).sort({ sku: 1 }).lean(),
    ChannelListingModel.find().sort({ sku: 1, channel: 1 }).lean(),
    channelStates(),
  ]);
  const mode = process.env.MARKETPLACE_MODE ?? 'simulate';

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Channels"
        subtitle="Map each SKU to its Amazon / Flipkart / Myntra listing, and push available stock."
        actions={<ActionButton label="Sync stock now" endpoint="/api/sync" variant="primary" successMessage="stock pushed ✓" />}
      />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Mappings" value={listings.length} />
        {CHANNELS.map((c) => (
          <StatCard key={c} label={c} value={listings.filter((l) => l.channel === c).length} hint="listings" />
        ))}
      </section>

      <div className="mb-6">
        <Badge tone={mode === 'live' ? 'good' : 'warn'}>
          Marketplace mode: {mode}{mode === 'simulate' ? ' (using built-in simulator — no real API calls)' : ''}
        </Badge>
      </div>

      <Panel title="Add / update a mapping">
        <AddListingForm skus={products.map((p) => p.sku)} channels={[...CHANNELS]} />
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`Mappings (${listings.length})`}>
          <Table head={<><Th>SKU</Th><Th>Channel</Th><Th>Channel SKU</Th><Th right>Price</Th></>} empty={listings.length === 0}>
            {listings.map((l, i) => (
              <Tr key={i}>
                <Td mono>{l.sku}</Td>
                <Td>{l.channel}</Td>
                <Td mono>{l.channelSku}</Td>
                <Td right>{inr(l.price)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>

        <Panel title="What each channel believes (last push)">
          <Table head={<><Th>Channel</Th><Th>Channel SKU</Th><Th right>Published</Th><Th right>Last push</Th></>} empty={states.length === 0}>
            {states.map((s, i) => (
              <Tr key={i}>
                <Td>{s.channel}</Td>
                <Td mono>{s.channelSku}</Td>
                <Td right>{num(s.publishedQty)}</Td>
                <Td right>{s.lastError ? <Badge tone="danger">error</Badge> : timeAgo(s.lastPushedAt as unknown as Date)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>
    </main>
  );
}
