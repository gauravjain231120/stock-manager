import { listReturnShipments, OVERDUE_DAYS } from '@/lib/returnShipments';
import { ProductModel } from '@/models/Product';
import { connectDB } from '@/lib/db';
import { PageHeader, StatCard } from '@/components/ui';
import { ReturnScanner } from '@/components/ReturnScanner';
import { AddReturnForm } from '@/components/AddReturnForm';
import { ReturnLists } from '@/components/ReturnLists';

export const dynamic = 'force-dynamic';

export default async function ReturnsPage() {
  await connectDB();
  const [rows, products] = await Promise.all([
    listReturnShipments(),
    ProductModel.find({ active: true }, { sku: 1, name: 1 }).sort({ sku: 1 }).lean(),
  ]);

  const expected = rows.filter((r) => r.status === 'EXPECTED');
  const received = rows.filter((r) => r.status === 'RECEIVED');
  const overdue = expected.filter((r) => r.overdue).length;
  const toClaim = received.filter((r) => r.condition === 'WRONG').length;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Returns"
        subtitle="Log a return when the customer starts it, then scan the parcel when it reaches you."
      />

      <div className="mb-6">
        <ReturnScanner />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="On the way" value={expected.length} tone={expected.length ? 'warn' : 'good'} hint="parcels to arrive" />
        <StatCard label={`Late (${OVERDUE_DAYS}+ days)`} value={overdue} tone={overdue ? 'danger' : 'default'} hint="chase the platform" />
        <StatCard label="Received" value={received.length} />
        <StatCard label="Wrong item" value={toClaim} tone={toClaim ? 'danger' : 'default'} hint="claim these" />
      </section>

      <div className="mb-6">
        <AddReturnForm products={products.map((p) => ({ sku: p.sku, name: p.name }))} />
      </div>

      <ReturnLists expected={expected} received={received} />
    </main>
  );
}
