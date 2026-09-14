import { connectDB } from '@/lib/db';
import { MovementType } from '@/lib/constants';
import { StockMovementModel } from '@/models/StockMovement';
import { SkuStockModel } from '@/models/SkuStock';
import { LocationModel } from '@/models/Location';
import { MarketplaceOrderModel } from '@/models/MarketplaceOrder';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SalesByChannel {
  channel: string;
  orders: number;
  units: number;
  revenue: number;
}

export interface MoverRow {
  sku: string;
  sold: number;
}

export interface ReportBundle {
  windowDays: number;
  salesByChannel: SalesByChannel[];
  totals: { orders: number; units: number; revenue: number; sold: number; returned: number };
  returnRatePct: number;
  fastMovers: MoverRow[];
  slowMovers: MoverRow[];
  damagedBySku: { sku: string; qty: number }[];
}

/** A bundle of reports over the last `days`. */
export async function reportBundle(days = 30): Promise<ReportBundle> {
  await connectDB();
  const cutoff = new Date(Date.now() - days * DAY_MS);

  // Sales by channel + revenue, from fulfilled order lines.
  const salesAgg = await MarketplaceOrderModel.aggregate<{
    _id: string;
    orders: number;
    units: number;
    revenue: number;
  }>([
    { $match: { placedAt: { $gte: cutoff } } },
    { $unwind: '$lines' },
    { $match: { 'lines.fulfilled': true } },
    {
      $group: {
        _id: '$channel',
        orders: { $addToSet: '$channelOrderId' },
        units: { $sum: '$lines.qty' },
        revenue: { $sum: { $multiply: ['$lines.qty', { $ifNull: ['$lines.price', 0] }] } },
      },
    },
    { $project: { orders: { $size: '$orders' }, units: 1, revenue: 1 } },
  ]);
  const salesByChannel: SalesByChannel[] = salesAgg.map((s) => ({
    channel: s._id,
    orders: s.orders,
    units: s.units,
    revenue: Math.round(s.revenue),
  }));

  // Sold / returned units from the ledger.
  const movementAgg = await StockMovementModel.aggregate<{ _id: string; total: number }>([
    { $match: { type: { $in: [MovementType.SOLD, MovementType.RETURNED] }, createdAt: { $gte: cutoff } } },
    { $group: { _id: '$type', total: { $sum: '$qty' } } },
  ]);
  const sold = -(movementAgg.find((m) => m._id === MovementType.SOLD)?.total ?? 0);
  const returned = movementAgg.find((m) => m._id === MovementType.RETURNED)?.total ?? 0;

  // Fast / slow movers by sold units.
  const moverAgg = await StockMovementModel.aggregate<{ _id: string; sold: number }>([
    { $match: { type: MovementType.SOLD, createdAt: { $gte: cutoff } } },
    { $group: { _id: '$sku', sold: { $sum: '$qty' } } },
    { $project: { sold: { $multiply: ['$sold', -1] } } },
    { $sort: { sold: -1 } },
  ]);
  const fastMovers = moverAgg.slice(0, 5).map((m) => ({ sku: m._id, sold: m.sold }));
  const slowMovers = [...moverAgg].reverse().slice(0, 5).map((m) => ({ sku: m._id, sold: m.sold }));

  // Damaged stock by SKU.
  const damagedCodes = new Set(
    (await LocationModel.find({ kind: 'DAMAGED' }).lean()).map((l) => l.code),
  );
  const damagedRows = await SkuStockModel.find().lean();
  const damagedBySku = damagedRows
    .filter((r) => damagedCodes.has(r.locationCode) && r.onHand > 0)
    .map((r) => ({ sku: r.sku, qty: r.onHand }))
    .sort((a, b) => b.qty - a.qty);

  const totalOrders = salesByChannel.reduce((a, s) => a + s.orders, 0);
  const totalUnits = salesByChannel.reduce((a, s) => a + s.units, 0);
  const totalRevenue = salesByChannel.reduce((a, s) => a + s.revenue, 0);
  const returnRatePct = sold > 0 ? Math.round((returned / sold) * 1000) / 10 : 0;

  return {
    windowDays: days,
    salesByChannel,
    totals: { orders: totalOrders, units: totalUnits, revenue: totalRevenue, sold, returned },
    returnRatePct,
    fastMovers,
    slowMovers,
    damagedBySku,
  };
}

export interface DailyPoint {
  day: string;
  units: number;
}

/** Shared day-bucketing for a single ledger movement type, IST-pinned like the rest of the app,
 *  zero-filled so every one of the last `days` days appears even with no activity.
 *  `negate` because SOLD's qty is stored negative (a decrement) while RETURNED's is positive. */
async function dailyMovementTrend(type: MovementType, days: number, negate: boolean): Promise<DailyPoint[]> {
  await connectDB();
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const agg = await StockMovementModel.aggregate<{ _id: string; units: number }>([
    { $match: { type, createdAt: { $gte: cutoff } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
        units: { $sum: '$qty' },
      },
    },
  ]);
  const byDay = new Map(agg.map((a) => [a._id, negate ? -a.units : a.units]));

  const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
  const points: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKeyFmt.format(new Date(Date.now() - i * DAY_MS));
    points.push({ day: key, units: byDay.get(key) ?? 0 });
  }
  return points;
}

/** Units sold per day — for the Dashboard's sales trend chart. */
export async function dailySoldTrend(days = 14): Promise<DailyPoint[]> {
  return dailyMovementTrend(MovementType.SOLD, days, true);
}

/** Units returned per day — every condition (Good/Used/Wrong item/Defective)
 *  counts here, since a RETURNED movement is posted for all of them
 *  (register.ts only varies which location it lands in, never the type).
 *  This is a "how many returns came in" volume chart, not a "how much
 *  restocked" one — see dailySoldTrend's sibling logic above. */
export async function dailyReturnedTrend(days = 14): Promise<DailyPoint[]> {
  return dailyMovementTrend(MovementType.RETURNED, days, false);
}
