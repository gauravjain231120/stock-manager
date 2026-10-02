import { connectDB } from '@/lib/db';
import { StockMovementModel } from '@/models/StockMovement';
import { ProductModel } from '@/models/Product';
import { MovementType } from '@/lib/constants';
import { PageHeader } from '@/components/ui';
import { AnalyticsClient } from './AnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function ReturnAnalyticsPage() {
  await connectDB();

  // Aggregate all SOLD and RETURNED movements by SKU
  const agg = await StockMovementModel.aggregate([
    { $match: { type: { $in: [MovementType.SOLD, MovementType.RETURNED] } } },
    {
      $group: {
        _id: '$sku',
        sold: {
          $sum: {
            $cond: [{ $eq: ['$type', MovementType.SOLD] }, '$qty', 0]
          }
        },
        returned: {
          $sum: {
            $cond: [{ $eq: ['$type', MovementType.RETURNED] }, '$qty', 0]
          }
        },
        rto: {
          $sum: {
            $cond: [
              { $and: [ { $eq: ['$type', MovementType.RETURNED] }, { $eq: ['$returnType', 'RTO'] } ] },
              '$qty',
              0
            ]
          }
        },
        customerReturns: {
          $sum: {
            $cond: [
              { $and: [ { $eq: ['$type', MovementType.RETURNED] }, { $in: ['$returnType', ['CUSTOMER', 'UNKNOWN', null]] } ] },
              '$qty',
              0
            ]
          }
        }
      }
    },
    {
      $project: {
        sku: '$_id',
        sold: { $multiply: ['$sold', -1] }, // SOLD is negative in db
        returned: 1,
        rto: 1,
        customerReturns: 1
      }
    },
    { $match: { sold: { $gt: 0 } } }, // Only show items that have been sold
    { $sort: { returned: -1, sold: -1 } }
  ]);

  // Fetch product details for the aggregated SKUs
  const skus = agg.map(a => a.sku);
  const products = await ProductModel.find({ sku: { $in: skus } }).lean();
  const productMap = new Map(products.map(p => [
    p.sku, 
    { 
      name: p.name, 
      category: p.category || '—', 
      attrs: p.attributes ? Object.entries(p.attributes).map(([k,v]) => v).join(' / ') : '' 
    }
  ]));

  const analytics = agg.map(row => {
    const returnRate = (row.returned / row.sold) * 100;
    
    // Customer return rate is CustomerReturns / (Sold - RTO)
    // because RTOs never reached the customer to be evaluated.
    const effectiveSold = row.sold - row.rto;
    const customerReturnRate = effectiveSold > 0 ? (row.customerReturns / effectiveSold) * 100 : 0;
    
    const prod = productMap.get(row.sku);
    let fullName = prod ? prod.name : 'Unknown';

    return {
      sku: row.sku,
      name: fullName,
      category: prod ? prod.category : '—',
      sold: row.sold,
      returned: row.returned,
      rto: row.rto,
      customerReturns: row.customerReturns,
      returnRate: returnRate,
      customerReturnRate: customerReturnRate,
      isToxic: customerReturnRate > 25 && row.customerReturns > 3
    };
  });

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Product Health & Return Analytics" subtitle="Identify toxic SKUs draining profits through high customer returns." />

      <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        <strong>How to read this:</strong> A high <strong>Customer Return %</strong> means customers are buying the item, trying it on, and sending it back (usually a sizing or quality defect). A high RTO means couriers failed to deliver it. 
        SKUs highlighted in <span className="font-semibold text-red-600 dark:text-red-400">red</span> have a customer return rate over 25% (with &gt;3 returns) and should be investigated or delisted immediately to stop margin bleed.
      </div>

      <AnalyticsClient data={analytics} />
    </main>
  );
}
