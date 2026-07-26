import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { SkuStockModel } from '@/models/SkuStock';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { postMovement } from '@/lib/stock';
import { MovementType, SystemLocation, stockSkuFor } from '@/lib/constants';

const MAIN = SystemLocation.MAIN;

export interface PendingRow {
  id: string;
  sku: string;
  /** The SKU whose physical stock this entry ships (differs for bundles). */
  stockSku: string;
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
    const st = stockBy.get(stockSkuFor(p.sku));
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
  // Reserve on the physical stock SKU (a bundle reserves its component's units).
  await SkuStockModel.updateOne(
    { sku: stockSkuFor(sku), locationCode: MAIN },
    { $inc: { reserved: qty }, $setOnInsert: { onHand: 0, buffer: 0 } },
    { upsert: true },
  );
  // Same product (+ platform) already queued -> add to its quantity.
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
  const stockSkus = [...new Set(items.map((i) => stockSkuFor(i.sku)))];
  const [products, stocks] = await Promise.all([
    ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1 }).lean(),
    SkuStockModel.find({ sku: { $in: stockSkus }, locationCode: MAIN }).lean(),
  ]);
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));
  const stockBy = new Map(stocks.map((s) => [s.sku, s]));
  return items.map((i) => {
    const st = stockBy.get(stockSkuFor(i.sku));
    const onHand = st?.onHand ?? 0;
    return {
      id: String(i._id),
      sku: i.sku,
      stockSku: stockSkuFor(i.sku),
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

/**
 * Pack & ship `qty` units from a queue entry (defaults to the whole entry):
 * deduct stock, release that many reservations, and remove the entry (or reduce
 * its qty if only part was shipped).
 */
export async function shipPending(id: string, qty?: number) {
  await connectDB();
  const p = await PendingShipmentModel.findById(id);
  if (!p) throw new Error('Item not found');
  const shipQty = qty && qty > 0 ? Math.min(Math.floor(qty), p.qty) : p.qty;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await postMovement(session, { sku: p.sku, locationCode: MAIN, qty: -shipQty, type: MovementType.SOLD, channel: p.channel || undefined, refType: 'SHIP' });
      await SkuStockModel.updateOne({ sku: stockSkuFor(p.sku), locationCode: MAIN }, { $inc: { reserved: -shipQty } }, { session });
      if (shipQty >= p.qty) await PendingShipmentModel.deleteOne({ _id: p._id }, { session });
      else await PendingShipmentModel.updateOne({ _id: p._id }, { $inc: { qty: -shipQty } }, { session });
    });
  } finally {
    await session.endSession();
  }
  return { sku: p.sku, qty: shipQty };
}

/**
 * Cancel `qty` units of a queue entry (defaults to the whole entry): release
 * that many reservations, and remove the entry or just reduce its quantity.
 * No stock is deducted.
 */
export async function cancelPending(id: string, qty?: number) {
  await connectDB();
  const p = await PendingShipmentModel.findById(id);
  if (!p) return { ok: true };
  const cancelQty = qty && qty > 0 ? Math.min(Math.floor(qty), p.qty) : p.qty;
  await SkuStockModel.updateOne({ sku: stockSkuFor(p.sku), locationCode: MAIN }, { $inc: { reserved: -cancelQty } });
  if (cancelQty >= p.qty) await PendingShipmentModel.deleteOne({ _id: p._id });
  else await PendingShipmentModel.updateOne({ _id: p._id }, { $inc: { qty: -cancelQty } });
  return { ok: true, cancelled: cancelQty };
}

/** Pack & ship a chosen set of queue entries (each shipped in full). */
export async function shipSelectedPending(ids: string[]) {
  await connectDB();
  let shipped = 0;
  for (const id of ids) {
    await shipPending(id);
    shipped++;
  }
  return { shipped };
}

export async function shipAllPending(channel?: string) {
  await connectDB();
  const items = await PendingShipmentModel.find(channel ? { channel } : {}).lean();
  for (const i of items) await shipPending(String(i._id));
  return { shipped: items.length };
}
