import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { MovementType, SystemLocation } from '@/lib/constants';
import { applyMovement, sellUnits } from '@/lib/stock';
import { ProductModel } from '@/models/Product';
import { StockMovementModel } from '@/models/StockMovement';
import { SkuStockModel } from '@/models/SkuStock';
import { LocationModel } from '@/models/Location';

export type RegisterAction = 'PRODUCE' | 'SHIP' | 'RETURN';
export const REGISTER_ACTIONS: RegisterAction[] = ['PRODUCE', 'SHIP', 'RETURN'];

/**
 * The simple "Stock Log": record one of three everyday actions against a SKU.
 *   PRODUCE  +stock   made some units
 *   SHIP     -stock   sent units to customers (refused if not enough stock)
 *   RETURN   +stock   units came back, good to resell
 * (An exchange = Return the old item + Ship the replacement.)
 */
export async function recordEntry(sku: string, action: RegisterAction, qty: number, channel?: string) {
  if (qty <= 0) throw new Error('Quantity must be greater than 0');
  const s = sku.trim().toUpperCase();
  const loc = SystemLocation.MAIN;

  switch (action) {
    case 'PRODUCE':
      return applyMovement({ sku: s, locationCode: loc, qty, type: MovementType.PRODUCED, refType: 'REGISTER' });
    case 'RETURN':
      return applyMovement({ sku: s, locationCode: loc, qty, type: MovementType.RETURNED, channel, refType: 'REGISTER' });
    case 'SHIP':
      return sellUnits({ sku: s, locationCode: loc, qty, channel, refType: 'REGISTER' });
    default:
      throw new Error(`Unknown action ${action}`);
  }
}

/**
 * Delete a Stock Log entry and reverse its effect on stock (so the number goes
 * back to what it was). Refuses if reversing would push stock negative — i.e. you
 * can't delete a Produce whose units have already been shipped. Only Stock Log
 * (REGISTER) entries can be deleted this way.
 */
export async function deleteEntry(movementId: string) {
  await connectDB();
  const mv = await StockMovementModel.findById(movementId).lean();
  if (!mv) throw new Error('Entry not found');
  if (mv.refType !== 'REGISTER') throw new Error('Only Stock Log entries can be deleted here');

  const reverse = -mv.qty; // undo the original stock delta
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (reverse !== 0) {
        const upd = await SkuStockModel.findOneAndUpdate(
          { sku: mv.sku, locationCode: mv.locationCode, $expr: { $gte: [{ $add: ['$onHand', reverse] }, '$reserved'] } },
          { $inc: { onHand: reverse } },
          { session, returnDocument: 'after' },
        );
        if (!upd) {
          throw new Error('Cannot delete: those units have already been shipped (stock would go negative).');
        }
      }
      await StockMovementModel.deleteOne({ _id: mv._id }, { session });
    });
  } finally {
    await session.endSession();
  }
}

export interface RegisterRow {
  sku: string;
  name: string;
  imageUrl?: string;
  produced: number;
  shipped: number;
  returned: number;
  inStock: number;
}

/** Per-product totals for the three actions + current stock. */
export async function registerTotals(): Promise<RegisterRow[]> {
  await connectDB();
  const [products, byType, stock, locations] = await Promise.all([
    ProductModel.find({ active: true }).sort({ sku: 1 }).lean(),
    StockMovementModel.aggregate<{ _id: { sku: string; type: string }; qty: number }>([
      { $group: { _id: { sku: '$sku', type: '$type' }, qty: { $sum: '$qty' } } },
    ]),
    SkuStockModel.find().lean(),
    LocationModel.find({ kind: 'SELLABLE' }).lean(),
  ]);

  const sellable = new Set(locations.map((l) => l.code));
  const inStockBySku = new Map<string, number>();
  for (const r of stock) {
    if (!sellable.has(r.locationCode)) continue;
    inStockBySku.set(r.sku, (inStockBySku.get(r.sku) ?? 0) + r.onHand);
  }

  type Agg = { produced: number; shipped: number; returned: number };
  const aggBySku = new Map<string, Agg>();
  for (const m of byType) {
    const a = aggBySku.get(m._id.sku) ?? { produced: 0, shipped: 0, returned: 0 };
    if (m._id.type === MovementType.PRODUCED) a.produced += m.qty;
    else if (m._id.type === MovementType.SOLD) a.shipped += -m.qty;
    else if (m._id.type === MovementType.RETURNED) a.returned += m.qty;
    aggBySku.set(m._id.sku, a);
  }

  return products.map((p) => {
    const a = aggBySku.get(p.sku) ?? { produced: 0, shipped: 0, returned: 0 };
    return {
      sku: p.sku,
      name: p.name,
      imageUrl: p.imageUrl ?? undefined,
      produced: a.produced,
      shipped: a.shipped,
      returned: a.returned,
      inStock: inStockBySku.get(p.sku) ?? 0,
    };
  });
}

/** Recent Stock-Log entries. */
export async function recentEntries(limit = 20) {
  await connectDB();
  return StockMovementModel.find({ refType: 'REGISTER' }).sort({ createdAt: -1 }).limit(limit).lean();
}

export interface ChannelBreakdownRow {
  channel: string;
  shipped: number;
  returned: number;
}

/** Units shipped and returned per platform (Amazon / Flipkart / Myntra / Own Site). */
export async function channelBreakdown(): Promise<ChannelBreakdownRow[]> {
  await connectDB();
  const rows = await StockMovementModel.aggregate<{ _id: { channel: string; type: string }; qty: number }>([
    { $match: { refType: 'REGISTER', channel: { $ne: null }, type: { $in: [MovementType.SOLD, MovementType.RETURNED] } } },
    { $group: { _id: { channel: '$channel', type: '$type' }, qty: { $sum: '$qty' } } },
  ]);

  const byChannel = new Map<string, ChannelBreakdownRow>();
  for (const r of rows) {
    const c = byChannel.get(r._id.channel) ?? { channel: r._id.channel, shipped: 0, returned: 0 };
    if (r._id.type === MovementType.SOLD) c.shipped += -r.qty;
    else if (r._id.type === MovementType.RETURNED) c.returned += r.qty;
    byChannel.set(r._id.channel, c);
  }
  return [...byChannel.values()].sort((a, b) => b.shipped - a.shipped);
}
