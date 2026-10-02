import { connectDB } from '@/lib/db';
import { StockMovementModel } from '@/models/StockMovement';
import { ProductModel } from '@/models/Product';
import { MovementType } from '@/lib/constants';
import { PageHeader, Panel, Table, Th, Td, Tr } from '@/components/ui';

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

  const toxicSkus = analytics.filter(a => a.isToxic).sort((a,b) => b.customerReturnRate - a.customerReturnRate);
  const otherSkus = analytics.filter(a => !a.isToxic);
  const finalList = [...toxicSkus, ...otherSkus];

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Product Health & Return Analytics" subtitle="Identify toxic SKUs draining profits through high customer returns." />

      <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        <strong>How to read this:</strong> A high <strong>Customer Return %</strong> means customers are buying the item, trying it on, and sending it back (usually a sizing or quality defect). A high RTO means couriers failed to deliver it. 
        SKUs highlighted in <span className="font-semibold text-red-600 dark:text-red-400">red</span> have a customer return rate over 25% (with &gt;3 returns) and should be investigated or delisted immediately to stop margin bleed.
      </div>

      <Panel title="SKU Return Leaderboard">
        <div className="overflow-x-auto">
          <Table 
            head={
              <>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th right>Sold</Th>
                <Th right>Total Returned</Th>
                <Th right>RTO (Courier)</Th>
                <Th right>Customer Returns</Th>
                <Th right>Customer Return %</Th>
              </>
            } 
            empty={finalList.length === 0}
          >
            {finalList.map((row) => (
              <Tr key={row.sku}>
                <Td mono className={row.isToxic ? "text-red-600 font-bold dark:text-red-400" : ""}>{row.sku}</Td>
                <Td className={row.isToxic ? "text-red-600 font-medium dark:text-red-400" : "font-medium"}>{row.name}</Td>
                <Td className="text-neutral-500">{row.category}</Td>
                <Td right>{row.sold}</Td>
                <Td right>{row.returned}</Td>
                <Td right className="text-neutral-500">{row.rto}</Td>
                <Td right className={row.isToxic ? "text-red-600 font-bold dark:text-red-400" : ""}>{row.customerReturns}</Td>
                <Td right>
                  {row.customerReturnRate > 0 ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.isToxic ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                      {row.customerReturnRate.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-neutral-400">0%</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        </div>
      </Panel>
    </main>
  );
}
