import { connectDB } from '@/lib/db';
import { MovementType } from '@/lib/constants';
import { dayKey } from '@/lib/format';
import { ProductModel } from '@/models/Product';
import { StockMovementModel } from '@/models/StockMovement';

/** One ledger entry, fleshed out with product details — powers Shipped and Returns. */
export interface MovementRow {
  id: string;
  at: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  /** The product's category, e.g. "Coord set" — empty when it has none. */
  category: string;
  channel: string | null;
  trackingId: string | null;
  orderId: string | null;
  /** Returns only: what came back (GOOD / USED / WRONG). */
  condition: string | null;
}

export interface MovementStats {
  count: number;
  units: number;
  /** Distinct order numbers — a multi-item order is one order, not one per SKU row. */
  orderCount: number;
  last30Count: number;
  last30Units: number;
  last30OrderCount: number;
  tracked: number;
  untracked: number;
  /** Today's date in India time (YYYY-MM-DD), for the day picker's default. */
  today: string;
}

/** Movements of one type, newest first, with product name / colour / size resolved. */
export async function listMovementRows(type: MovementType, limit = 2000): Promise<MovementRow[]> {
  await connectDB();
  const movements = await StockMovementModel.find({ type }).sort({ createdAt: -1 }).limit(limit).lean();

  const skus = [...new Set(movements.map((m) => m.sku))];
  const products = await ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1, category: 1, attributes: 1 }).lean();
  const infoBy = new Map(
    products.map((p) => {
      const attrs: Record<string, string> =
        p.attributes instanceof Map ? Object.fromEntries(p.attributes) : ((p.attributes as Record<string, string>) ?? {});
      return [
        p.sku,
        {
          name: p.category?.trim() || p.name,
          category: p.category?.trim() ?? '',
          color: attrs.color?.trim() ?? '',
          size: attrs.size?.trim() ?? '',
        },
      ];
    }),
  );

  return movements.map((m) => {
    const info = infoBy.get(m.sku);
    return {
      id: String(m._id),
      at: (m.createdAt as unknown as Date).toISOString(),
      sku: m.sku,
      name: info?.name ?? m.sku,
      color: info?.color ?? '',
      size: info?.size ?? '',
      qty: Math.abs(m.qty),
      category: info?.category ?? '',
      channel: m.channel ?? null,
      trackingId: m.trackingId ?? null,
      orderId: m.orderId ?? null,
      condition: m.condition ?? null,
    };
  });
}

/** Headline numbers for one movement type, counted over the whole ledger. */
export async function movementStats(type: MovementType): Promise<MovementStats> {
  await connectDB();
  const since = new Date(Date.now() - 30 * 86_400_000);
  // A row with no order number can't be grouped with anything else, so it
  // counts as its own order — the same convention the Ready-to-Ship queue
  // uses (order number if there is one, else the row's own id). Two separate
  // $addToSet groups (all-time, last 30 days) rather than one conditional
  // set, since a set accumulator has no clean "skip this document" expression.
  const [agg] = await StockMovementModel.aggregate<{
    count: number; units: number; last30Count: number; last30Units: number; tracked: number; orderKeys: string[];
  }>([
    { $match: { type } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        units: { $sum: { $abs: '$qty' } },
        last30Count: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, 1, 0] } },
        last30Units: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, { $abs: '$qty' }, 0] } },
        tracked: { $sum: { $cond: [{ $ifNull: ['$trackingId', false] }, 1, 0] } },
        orderKeys: { $addToSet: { $ifNull: ['$orderId', { $toString: '$_id' }] } },
      },
    },
  ]);
  const [last30Agg] = await StockMovementModel.aggregate<{ orderKeys: string[] }>([
    { $match: { type, createdAt: { $gte: since } } },
    { $group: { _id: null, orderKeys: { $addToSet: { $ifNull: ['$orderId', { $toString: '$_id' }] } } } },
  ]);

  const count = agg?.count ?? 0;
  const tracked = agg?.tracked ?? 0;
  return {
    count,
    units: agg?.units ?? 0,
    orderCount: agg?.orderKeys.length ?? 0,
    last30Count: agg?.last30Count ?? 0,
    last30Units: agg?.last30Units ?? 0,
    last30OrderCount: last30Agg?.orderKeys.length ?? 0,
    tracked,
    untracked: count - tracked,
    today: dayKey(new Date()),
  };
}
