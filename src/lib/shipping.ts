import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { SkuStockModel } from '@/models/SkuStock';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { StockMovementModel } from '@/models/StockMovement';
import { postMovement } from '@/lib/stock';
import { MovementType, SystemLocation, stockSkuFor, infoStockFor } from '@/lib/constants';

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
  /** Companion stock shown for reference next to bundles (never deducted). */
  info: { sku: string; label: string; onHand: number } | null;
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
  const infoSkus = items.map((i) => infoStockFor(i.sku)?.sku).filter((s): s is string => Boolean(s));
  const stockSkus = [...new Set([...items.map((i) => stockSkuFor(i.sku)), ...infoSkus])];
  const [products, stocks] = await Promise.all([
    ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1 }).lean(),
    SkuStockModel.find({ sku: { $in: stockSkus }, locationCode: MAIN }).lean(),
  ]);
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));
  const stockBy = new Map(stocks.map((s) => [s.sku, s]));
  return items.map((i) => {
    const st = stockBy.get(stockSkuFor(i.sku));
    const onHand = st?.onHand ?? 0;
    const inf = infoStockFor(i.sku);
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
      info: inf ? { sku: inf.sku, label: inf.label, onHand: stockBy.get(inf.sku)?.onHand ?? 0 } : null,
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
export async function shipPending(id: string, qty?: number, trackingId?: string) {
  await connectDB();
  const p = await PendingShipmentModel.findById(id);
  if (!p) throw new Error('Item not found');
  const shipQty = qty && qty > 0 ? Math.min(Math.floor(qty), p.qty) : p.qty;
  const tracking = trackingId?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || undefined;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await postMovement(session, {
        sku: p.sku,
        locationCode: MAIN,
        qty: -shipQty,
        type: MovementType.SOLD,
        channel: p.channel || undefined,
        refType: 'SHIP',
        trackingId: tracking,
        orderId: p.orderId || undefined,
      });
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
 * Fix a queued order before it ships: swap the product, platform, order number or
 * quantity. Reservations follow the change so the "available" figure stays right.
 */
export async function editPending(
  id: string,
  changes: { sku?: string; qty?: number; channel?: string; orderId?: string },
) {
  await connectDB();
  const p = await PendingShipmentModel.findById(id);
  if (!p) throw new Error('Item not found');

  const oldSku = p.sku;
  const oldQty = p.qty;

  if (changes.sku !== undefined) {
    const sku = changes.sku.trim().toUpperCase();
    if (!(await ProductModel.exists({ sku }))) throw new Error('Product not found');
    p.sku = sku;
  }
  if (changes.qty !== undefined) {
    const qty = Math.floor(changes.qty);
    if (!(qty >= 1)) throw new Error('Quantity must be at least 1');
    p.qty = qty;
  }
  if (changes.channel !== undefined) p.channel = changes.channel || undefined;
  if (changes.orderId !== undefined) p.orderId = changes.orderId.trim() || undefined;

  // Move the reservation: release everything held on the old pool, hold the new.
  const oldPool = stockSkuFor(oldSku);
  const newPool = stockSkuFor(p.sku);
  if (oldPool === newPool) {
    const delta = p.qty - oldQty;
    if (delta !== 0) {
      await SkuStockModel.updateOne(
        { sku: newPool, locationCode: MAIN },
        { $inc: { reserved: delta }, $setOnInsert: { onHand: 0, buffer: 0 } },
        { upsert: true },
      );
    }
  } else {
    await SkuStockModel.updateOne({ sku: oldPool, locationCode: MAIN }, { $inc: { reserved: -oldQty } });
    await SkuStockModel.updateOne(
      { sku: newPool, locationCode: MAIN },
      { $inc: { reserved: p.qty }, $setOnInsert: { onHand: 0, buffer: 0 } },
      { upsert: true },
    );
  }

  await p.save();
  return { id: String(p._id), sku: p.sku, qty: p.qty };
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

export interface ShippedRow {
  id: string;
  shippedAt: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  channel: string | null;
  trackingId: string | null;
  orderId: string | null;
}

/** Everything that has shipped, newest first — the Shipped page. */
export async function listShipped(limit = 2000): Promise<ShippedRow[]> {
  await connectDB();
  const movements = await StockMovementModel.find({ type: MovementType.SOLD })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const skus = [...new Set(movements.map((m) => m.sku))];
  const products = await ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1, category: 1, attributes: 1 }).lean();
  const infoBy = new Map(
    products.map((p) => {
      const attrs: Record<string, string> =
        p.attributes instanceof Map ? Object.fromEntries(p.attributes) : ((p.attributes as Record<string, string>) ?? {});
      return [p.sku, { name: p.category?.trim() || p.name, color: attrs.color?.trim() ?? '', size: attrs.size?.trim() ?? '' }];
    }),
  );

  return movements.map((m) => {
    const info = infoBy.get(m.sku);
    return {
      id: String(m._id),
      shippedAt: (m.createdAt as unknown as Date).toISOString(),
      sku: m.sku,
      name: info?.name ?? m.sku,
      color: info?.color ?? '',
      size: info?.size ?? '',
      qty: Math.abs(m.qty),
      channel: m.channel ?? null,
      trackingId: m.trackingId ?? null,
      orderId: m.orderId ?? null,
    };
  });
}

export interface ShippedStats {
  shipments: number;
  units: number;
  last30Shipments: number;
  last30Units: number;
  tracked: number;
  untracked: number;
}

/** Headline numbers for the Shipped page, counted over every shipment ever. */
export async function shippedStats(): Promise<ShippedStats> {
  await connectDB();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [agg] = await StockMovementModel.aggregate<{
    shipments: number; units: number; last30Shipments: number; last30Units: number; tracked: number;
  }>([
    { $match: { type: MovementType.SOLD } },
    {
      $group: {
        _id: null,
        shipments: { $sum: 1 },
        units: { $sum: { $abs: '$qty' } },
        last30Shipments: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, 1, 0] } },
        last30Units: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, { $abs: '$qty' }, 0] } },
        tracked: { $sum: { $cond: [{ $ifNull: ['$trackingId', false] }, 1, 0] } },
      },
    },
  ]);

  const shipments = agg?.shipments ?? 0;
  const tracked = agg?.tracked ?? 0;
  return {
    shipments,
    units: agg?.units ?? 0,
    last30Shipments: agg?.last30Shipments ?? 0,
    last30Units: agg?.last30Units ?? 0,
    tracked,
    untracked: shipments - tracked,
  };
}

export async function shipAllPending(channel?: string) {
  await connectDB();
  const items = await PendingShipmentModel.find(channel ? { channel } : {}).lean();
  for (const i of items) await shipPending(String(i._id));
  return { shipped: items.length };
}
