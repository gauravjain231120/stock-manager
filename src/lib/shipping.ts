import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';
import { SkuStockModel } from '@/models/SkuStock';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { StockMovementModel } from '@/models/StockMovement';
import { postMovement } from '@/lib/stock';
import { MovementType, SystemLocation, stockSkuFor, infoStockFor, cleanTracking } from '@/lib/constants';
import { VariantMeta, variantMeta } from '@/lib/variants';

const MAIN = SystemLocation.MAIN;

export interface PendingRow {
  id: string;
  sku: string;
  /** The SKU whose physical stock this entry ships (differs for bundles). */
  stockSku: string;
  name: string;
  /** The product's category, e.g. "Coord set" — empty when it has none. */
  category: string;
  qty: number;
  channel: string | null;
  orderId: string | null;
  trackingId: string | null;
  createdAt: string;
  onHand: number;
  available: number;
  /** Companion stock shown for reference next to bundles (never deducted). */
  info: { sku: string; label: string; onHand: number } | null;
}

/** Parent product + colour/size are carried so the add form's picker can build its rows. */
export interface ShipProduct extends VariantMeta {
  sku: string;
  name: string;
  onHand: number;
  available: number;
}

/** Products with current on-hand and available (on-hand − reserved) for the add form. */
export async function shipProducts(): Promise<ShipProduct[]> {
  await connectDB();
  const [products, stocks, groups] = await Promise.all([
    ProductModel.find(
      { active: true },
      { sku: 1, name: 1, groupCode: 1, category: 1, imageUrl: 1, attributes: 1 },
    ).sort({ sku: 1 }).lean(),
    SkuStockModel.find({ locationCode: MAIN }).lean(),
    ProductGroupModel.find({}, { code: 1, name: 1 }).lean(),
  ]);
  const stockBy = new Map(stocks.map((s) => [s.sku, s]));
  const groupNameByCode = new Map(groups.map((g) => [g.code, g.name]));
  return products.map((p) => {
    const st = stockBy.get(stockSkuFor(p.sku));
    const onHand = st?.onHand ?? 0;
    return {
      ...variantMeta(p, p.groupCode ? groupNameByCode.get(p.groupCode) : undefined),
      sku: p.sku,
      name: p.name,
      onHand,
      available: onHand - (st?.reserved ?? 0),
    };
  });
}

/** Add an order to the queue and RESERVE its stock (does not deduct on-hand yet). */
export async function addPending(input: { sku: string; qty: number; channel?: string; orderId?: string; trackingId?: string }) {
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
  // Same product (+ platform) already queued -> add to its quantity. Orders that
  // carry their own order number stay on their own row so it isn't lost.
  const orderId = input.orderId?.trim() || undefined;
  const existing = await PendingShipmentModel.findOne({
    sku,
    ...(channel ? { channel } : {}),
    ...(orderId ? { orderId } : { orderId: { $in: [null, ''] } }),
  });
  if (existing) {
    existing.qty += qty;
    await existing.save();
    return { id: String(existing._id) };
  }
  const doc = await PendingShipmentModel.create({ sku, qty, channel, orderId, trackingId: cleanTracking(input.trackingId) });
  return { id: String(doc._id) };
}

export async function listPending(): Promise<PendingRow[]> {
  await connectDB();
  const items = await PendingShipmentModel.find().sort({ createdAt: 1 }).lean();
  const skus = [...new Set(items.map((i) => i.sku))];
  const infoSkus = items.map((i) => infoStockFor(i.sku)?.sku).filter((s): s is string => Boolean(s));
  const stockSkus = [...new Set([...items.map((i) => stockSkuFor(i.sku)), ...infoSkus])];
  const [products, stocks] = await Promise.all([
    ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1, category: 1 }).lean(),
    SkuStockModel.find({ sku: { $in: stockSkus }, locationCode: MAIN }).lean(),
  ]);
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));
  const categoryBy = new Map(products.map((p) => [p.sku, p.category?.trim() ?? '']));
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
      category: categoryBy.get(i.sku) ?? '',
      qty: i.qty,
      channel: i.channel ?? null,
      orderId: i.orderId ?? null,
      trackingId: i.trackingId ?? null,
      createdAt: (i.createdAt as unknown as Date).toISOString(),
      onHand,
      available: onHand - (st?.reserved ?? 0),
      info: inf ? { sku: inf.sku, label: inf.label, onHand: stockBy.get(inf.sku)?.onHand ?? 0 } : null,
    };
  });
}

export interface OrderIdUse {
  where: 'QUEUE' | 'SHIPPED';
  sku: string;
  name: string;
  qty: number;
  channel: string | null;
  at: string | null;
}

/**
 * Where an order number is already used — so the add form can warn before the
 * same order is queued or shipped twice. One order legitimately covering two
 * different products is common, so this warns rather than blocks.
 */
export async function findOrderIdUses(orderId: string): Promise<OrderIdUse[]> {
  await connectDB();
  const id = orderId.trim();
  if (!id) return [];

  const [queued, shipped] = await Promise.all([
    PendingShipmentModel.find({ orderId: id }).lean(),
    StockMovementModel.find({ orderId: id, type: MovementType.SOLD }).sort({ createdAt: -1 }).lean(),
  ]);
  const skus = [...new Set([...queued, ...shipped].map((r) => r.sku))];
  const products = await ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1 }).lean();
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));

  return [
    ...queued.map((q) => ({
      where: 'QUEUE' as const,
      sku: q.sku,
      name: nameBy.get(q.sku) ?? q.sku,
      qty: q.qty,
      channel: q.channel ?? null,
      at: null,
    })),
    ...shipped.map((s) => ({
      where: 'SHIPPED' as const,
      sku: s.sku,
      name: nameBy.get(s.sku) ?? s.sku,
      qty: Math.abs(s.qty),
      channel: s.channel ?? null,
      at: (s.createdAt as unknown as Date).toISOString(),
    })),
  ];
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
export async function shipPending(id: string, qty?: number, trackingId?: string, orderId?: string) {
  await connectDB();
  const p = await PendingShipmentModel.findById(id);
  if (!p) throw new Error('Item not found');
  const shipQty = qty && qty > 0 ? Math.min(Math.floor(qty), p.qty) : p.qty;
  // A number typed at packing time wins; otherwise use whatever was saved on the row.
  const tracking = cleanTracking(trackingId) ?? p.trackingId ?? undefined;
  // A tracking number belongs to the parcel going out now, not to the units left
  // behind — so only pin it to the row when the whole row ships (kept for the
  // retry if the transaction below fails). A part-ship clears it instead.
  const partial = shipQty < p.qty;
  if (!partial && trackingId?.trim() && tracking !== p.trackingId) {
    await PendingShipmentModel.updateOne({ _id: p._id }, { $set: { trackingId: tracking } });
  }
  // An order number typed at packing time wins, and sticks to whatever is left
  // on the row when only part of it ships.
  const order = orderId?.trim() || p.orderId || undefined;
  if (orderId?.trim() && orderId.trim() !== p.orderId) {
    await PendingShipmentModel.updateOne({ _id: p._id }, { $set: { orderId: orderId.trim() } });
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Never let a shipment drive stock below zero, even when the API is called
      // directly — postMovement applies its delta unconditionally.
      const enough = await SkuStockModel.findOne(
        { sku: stockSkuFor(p.sku), locationCode: MAIN, $expr: { $gte: [{ $subtract: ['$onHand', shipQty] }, 0] } },
        { _id: 1 },
        { session },
      );
      if (!enough) throw new Error(`Not enough stock to ship ${shipQty} × ${p.sku}.`);

      await postMovement(session, {
        sku: p.sku,
        locationCode: MAIN,
        qty: -shipQty,
        type: MovementType.SOLD,
        channel: p.channel || undefined,
        refType: 'SHIP',
        trackingId: tracking,
        orderId: order,
      });
      await SkuStockModel.updateOne({ sku: stockSkuFor(p.sku), locationCode: MAIN }, { $inc: { reserved: -shipQty } }, { session });
      if (shipQty >= p.qty) await PendingShipmentModel.deleteOne({ _id: p._id }, { session });
      // What's left needs its own label: drop the AWB that just went out, so the
      // remainder doesn't sit in the queue looking like it already shipped.
      else await PendingShipmentModel.updateOne({ _id: p._id }, { $inc: { qty: -shipQty }, $unset: { trackingId: '' } }, { session });
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
  changes: { sku?: string; qty?: number; channel?: string; orderId?: string; trackingId?: string },
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
  if (changes.trackingId !== undefined) p.trackingId = cleanTracking(changes.trackingId);

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
  return {
    ok: true,
    cancelled: cancelQty,
    // Re-queueing these values puts the order back exactly as it was (Undo).
    undo: { sku: p.sku, qty: cancelQty, channel: p.channel ?? undefined, orderId: p.orderId ?? undefined },
  };
}

/**
 * Ship every queued line of one order in a single go — one parcel, one tracking
 * number on all of them. Used when a marketplace order holds several products.
 */
export async function shipOrder(orderId: string, trackingId?: string) {
  await connectDB();
  const id = orderId.trim();
  if (!id) throw new Error('Which order?');
  const items = await PendingShipmentModel.find({ orderId: id }).lean();
  if (items.length === 0) throw new Error('Nothing queued for that order');

  let units = 0;
  for (const i of items) {
    await shipPending(String(i._id), undefined, trackingId);
    units += i.qty;
  }
  return { shipped: items.length, units };
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
