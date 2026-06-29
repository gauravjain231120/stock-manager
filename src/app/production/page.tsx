import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { listRawMaterials, lowRawMaterials, listProductionBatches } from '@/lib/production';
import { PageHeader, StatCard, Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { CreateBatchForm, ReceiveMaterialForm } from '@/components/forms';
import { num, dateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProductionPage() {
  await connectDB();
  const [products, materials, low, batches] = await Promise.all([
    ProductModel.find({ active: true }).sort({ sku: 1 }).lean(),
    listRawMaterials(),
    lowRawMaterials(),
    listProductionBatches(25),
  ]);
  const skus = products.map((p) => p.sku);
  const lowCodes = new Set(low.map((m) => m.code));

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Production" subtitle="Record manufacturing runs — consumes raw materials per the BOM and produces finished goods." />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Raw materials" value={materials.length} />
        <StatCard label="Low materials" value={low.length} tone={low.length > 0 ? 'danger' : 'good'} hint="at/below reorder point" />
        <StatCard label="Batches logged" value={batches.length} hint="recent" />
        <StatCard label="Finished SKUs" value={skus.length} />
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Record production">
          <CreateBatchForm skus={skus} />
          <p className="px-4 pb-4 text-xs text-neutral-400">Uses the SKU&apos;s bill of materials. If raw stock is short, the batch is refused.</p>
        </Panel>
        <Panel title="Receive raw material">
          <ReceiveMaterialForm materials={materials.map((m) => m.code)} />
          <p className="px-4 pb-4 text-xs text-neutral-400">Logs a supplier delivery against a material.</p>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Raw materials (${materials.length})`}>
          <Table head={<><Th>Code</Th><Th>Name</Th><Th right>On hand</Th><Th right>Reorder pt</Th></>} empty={materials.length === 0}>
            {materials.map((m) => (
              <Tr key={m.code}>
                <Td mono>{m.code}</Td>
                <Td>{m.name}{lowCodes.has(m.code) ? <> <Badge tone="danger">low</Badge></> : null}</Td>
                <Td right>{num(m.onHand)} {m.unit}</Td>
                <Td right>{num(m.reorderPoint)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>

        <Panel title="Production batches">
          <Table head={<><Th>When</Th><Th>SKU</Th><Th right>Qty</Th><Th>Location</Th></>} empty={batches.length === 0}>
            {batches.map((b) => (
              <Tr key={String(b._id)}>
                <Td>{dateTime(b.createdAt as unknown as Date)}</Td>
                <Td mono>{b.sku}</Td>
                <Td right>{num(b.qty)}</Td>
                <Td>{b.locationCode}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>
    </main>
  );
}
