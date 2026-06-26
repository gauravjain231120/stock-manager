import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { SkuStockModel } from '@/models/SkuStock';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { postMovement } from '@/lib/stock';
import { MovementType, SystemLocation } from '@/lib/constants';

const MAIN = SystemLocation.MAIN;

export interface PendingRow {
  id: string;
  sku: string;
  name: string;
  qty: number;
  channel: string | null;
  orderId: string | null;
  createdAt: string;
  onHand: number;
  available: number;
}

export interface ShipProduct {
  sku: string;
  name: string;
  onHand: number;
  available: number;
}

/** Products with current on-hand and available (on-hand − reserved) for the add form. */
export async function shipProducts(): Promise<ShipProduct[]> {
  await connectDB();
  const [products, stocks] = await Promise.all([
    ProductModel.find({ active: true }, { sku: 1, name: 1 }).sort({ sku: 1 }).lean(),
    SkuStockModel.find({ locationCode: MAIN }).lean(),
  ]);
  const stockBy = new Map(stocks.map((s) => [s.sku, s]));
  return products.map((p) => {
    const st = stockBy.get(p.sku);
    const onHand = st?.onHand ?? 0;
    return { sku: p.sku, name: p.name, onHand, available: onHand - (st?.reserved ?? 0) };
  });
}

/** Add an order to the queue and RESERVE its stock (does not deduct on-hand yet). */
export async function addPending(input: { sku: string; qty: number; channel?: string; orderId?: string }) {
  await connectDB();
  const sku = input.sku.trim().toUpperCase();
  const qty = Math.floor(input.qty);
  if (!(qty >= 1)) throw new Error('Quantity must be at least 1');
  if (!(await ProductModel.exists({ sku }))) throw new Error('Product not found');

  const channel = input.channel || undefined;
  await SkuStockModel.updateOne(
    { sku, locationCode: MAIN },
    { $inc: { reserved: qty }, $setOnInsert: { onHand: 0, buffer: 0 } },
    { upsert: true },
  );
  // If the same product (+ platform) is already queued, just add to its quantity.
  const existing = await PendingShipmentModel.findOne({ sku, ...(channel ? { channel } : {}) });
  if (existing) {
    existing.qty += qty;
    await existing.save();
    return { id: String(existing._id) };
  }
  const doc = await PendingShipmentModel.create({ sku, qty, channel });
  return { id: String(doc._id) };
}

export async function listPending(): Promise<PendingRow[]> {
  await connectDB();
  const items = await PendingShipmentModel.find().sort({ createdAt: 1 }).lean();
  const skus = [...new Set(items.map((i) => i.sku))];
  const [products, stocks] = await Promise.all([
    ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1 }).lean(),
    SkuStockModel.find({ sku: { $in: skus }, locationCode: MAIN }).lean(),
  ]);
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));
  const stockBy = new Map(stocks.map((s) => [s.sku, s]));
  return items.map((i) => {
    const st = stockBy.get(i.sku);
    const onHand = st?.onHand ?? 0;
    return {
      id: String(i._id),
      sku: i.sku,
      name: nameBy.get(i.sku) ?? i.sku,
      qty: i.qty,
      channel: i.channel ?? null,
      orderId: i.orderId ?? null,
      createdAt: (i.createdAt as unknown as Date).toISOString(),
      onHand,
      available: onHand - (st?.reserved ?? 0),
    };
  });
}

export async function pendingCount(): Promise<number> {
  await connectDB();
  return PendingShipmentModel.countDocuments();
}

/** Pack & ship: deduct stock (Sold movement), release the reservation, remove from queue. */
export async function shipPending(id: string) {
  await connectDB();
  const p = await PendingShipmentModel.findById(id);
  if (!p) throw new Error('Item not found');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await postMovement(session, { sku: p.sku, locationCode: MAIN, qty: -p.qty, type: MovementType.SOLD, channel: p.channel || undefined, refType: 'SHIP' });
      await SkuStockModel.updateOne({ sku: p.sku, locationCode: MAIN }, { $inc: { reserved: -p.qty } }, { session });
      await PendingShipmentModel.deleteOne({ _id: p._id }, { session });
    });
  } finally {
    await session.endSession();
  }
  return { sku: p.sku, qty: p.qty };
}

/** Cancel: release the reservation and remove from queue. No stock deducted. */
export async function cancelPending(id: string) {
  await connectDB();
  const p = await PendingShipmentModel.findById(id);
  if (!p) return { ok: true };
  await SkuStockModel.updateOne({ sku: p.sku, locationCode: MAIN }, { $inc: { reserved: -p.qty } });
  await PendingShipmentModel.deleteOne({ _id: p._id });
  return { ok: true };
}

export async function shipAllPending() {
  await connectDB();
  const items = await PendingShipmentModel.find().lean();
  for (const i of items) await shipPending(String(i._id));
  return { shipped: items.length };
}
