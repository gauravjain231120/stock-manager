import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';
import { SkuStockModel } from '@/models/SkuStock';
import { QueueCancelModel } from '@/models/QueueCancel';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { StockMovementModel } from '@/models/StockMovement';
import { postMovement } from '@/lib/stock';
import { MovementType, SystemLocation, infoStockFor, cleanTracking } from '@/lib/constants';
import { stockSkuFor } from '@/lib/stockShare';
import { VariantMeta, variantMeta, attrsOf } from '@/lib/variants';

const MAIN = SystemLocation.MAIN;

export interface PendingRow {
  id: string;
  sku: string;
  /** The SKU whose physical stock this entry ships (differs for bundles). */
  stockSku: string;
  /** That SKU's product name, e.g. "Co-ord Set" — only set when it isn't this one. */
  stockName: string | null;
  name: string;
  /** The product's category, e.g. "Coord set" — empty when it has none. */
  category: string;
  /** The variant's colour attribute, e.g. "Blue-Bandhej" — empty when it has none. */
  color: string;
  qty: number;
  channel: string | null;
  orderId: string | null;
  trackingId: string | null;
  createdAt: string;
  /** When the marketplace order was actually placed (distinct from createdAt, which is when it was queued here). */
  placedAt: string | null;
  shipByAt: string | null;
  onHand: number;
  available: number;
  /** Companion stock shown for reference next to bundles (never deducted). */
  info: { sku: string; label: string; onHand: number } | null;
  /** Packed and set aside — kept off the print sheet so it isn't packed twice. */
  ready: boolean;
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
  const pileBySku = new Map(await Promise.all(products.map(async (p) => [p.sku, await stockSkuFor(p.sku)] as const)));
  return products.map((p) => {
    const st = stockBy.get(pileBySku.get(p.sku)!);
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
export async function addPending(input: {
  sku: string;
  qty: number;
  channel?: string;
  orderId?: string;
  trackingId?: string;
  placedAt?: string | Date;
  shipByAt?: string | Date;
  /** Always create a fresh row, even if one for this sku+order already exists. */
  noMerge?: boolean;
}) {
  await connectDB();
  let sku = input.sku.trim().toUpperCase();
  const qty = Math.floor(input.qty);
  if (!(qty >= 1)) throw new Error('Quantity must be at least 1');
  if (!(await ProductModel.exists({ sku }))) {
    // Marketplace SKUs use inconsistent brand prefixes for the same variant
    // (RR-/R-/RRC- all mean the same product) — a caller normalizing to one
    // of those (see canonicalSku in the alert bot) shouldn't fail just
    // because this particular catalog entry happens to use a different one.
    // Fall back to matching by everything after the first "-" before giving up.
    const idx = sku.indexOf('-');
    const suffix = idx === -1 ? sku : sku.slice(idx + 1);
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = await ProductModel.findOne({ sku: new RegExp(`-${escaped}$`, 'i') });
    if (!match) throw new Error('Product not found');
    sku = match.sku;
  }

  const channel = input.channel || undefined;
  const pool = await stockSkuFor(sku);
  const orderId = input.orderId?.trim() || undefined;
  // Reservation + queue row in ONE transaction: a failure between the two
  // used to leave stock reserved for a row that never got created (only
  // "Fix reserved" could undo it).
  let resultId = '';
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Reserve on the physical stock SKU (a bundle reserves its component's units).
      await SkuStockModel.updateOne(
        { sku: pool, locationCode: MAIN },
        { $inc: { reserved: qty }, $setOnInsert: { onHand: 0, buffer: 0 } },
        { session, upsert: true },
      );
      resultId = await addPendingRow(session, { sku, qty, channel, orderId, input });
    });
  } finally {
    await session.endSession();
  }
  return { id: resultId };
}

async function addPendingRow(
  session: mongoose.ClientSession,
  {
    sku,
    qty,
    channel,
    orderId,
    input,
  }: { sku: string; qty: number; channel?: string; orderId?: string; input: { trackingId?: string; placedAt?: string | Date; shipByAt?: string | Date; noMerge?: boolean } },
): Promise<string> {
  // ONLY the same order number merges — two units of one product on one order are
  // one row of qty 2. Everything else gets its own row: two customers who bought
  // the same product are two parcels to pack, and collapsing them into a single
  // qty-2 row loses that. Rows added without an order number never merge, since
  // there's nothing to say they belong together. noMerge skips this entirely —
  // used by the order-alert integrations, which add one unit at a time so every
  // physical piece keeps its own row instead of collapsing into a qty count.
  if (orderId && !input.noMerge) {
    const existing = await PendingShipmentModel.findOneAndUpdate(
      { sku, ...(channel ? { channel } : {}), orderId },
      { $inc: { qty } },
      { session, returnDocument: 'after' },
    );
    if (existing) return String(existing._id);
  }
  const [doc] = await PendingShipmentModel.create(
    [
      {
        sku,
        qty,
        channel,
        orderId,
        trackingId: cleanTracking(input.trackingId),
        placedAt: input.placedAt,
        shipByAt: input.shipByAt,
      },
    ],
    { session },
  );
  return String(doc._id);
}

export async function listPending(): Promise<PendingRow[]> {
  await connectDB();
  const items = await PendingShipmentModel.find().sort({ createdAt: 1 }).lean();
  const skus = [...new Set(items.map((i) => i.sku))];
  const pileBySku = new Map(await Promise.all(skus.map(async (s) => [s, await stockSkuFor(s)] as const)));
  const infoSkus = items.map((i) => infoStockFor(i.sku)?.sku).filter((s): s is string => Boolean(s));
  const stockSkus = [...new Set([...skus.map((s) => pileBySku.get(s)!), ...infoSkus])];
  const [products, stockProducts, stocks] = await Promise.all([
    ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1, category: 1, attributes: 1 }).lean(),
    // Whose pile a bundle actually draws on, so the queue can name it.
    ProductModel.find({ sku: { $in: stockSkus } }, { sku: 1, name: 1, groupCode: 1 }).lean(),
    SkuStockModel.find({ sku: { $in: stockSkus }, locationCode: MAIN }).lean(),
  ]);
  const groups = await ProductGroupModel.find(
    { code: { $in: [...new Set(stockProducts.map((p) => p.groupCode).filter((c): c is string => Boolean(c)))] } },
    { code: 1, name: 1 },
  ).lean();
  const groupNameBy = new Map(groups.map((g) => [g.code, g.name]));
  // Prefer the parent product's name ("Co-ord Set") over the variant's full name
  // ("Co-ord Set Black-Ikat 3XL") — the row already shows the colour and size.
  const stockNameBy = new Map(
    stockProducts.map((p) => [p.sku, (p.groupCode && groupNameBy.get(p.groupCode)) || p.name]),
  );
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));
  const categoryBy = new Map(products.map((p) => [p.sku, p.category?.trim() ?? '']));
  const colorBy = new Map(products.map((p) => [p.sku, attrsOf(p.attributes).color?.trim() ?? '']));
  const stockBy = new Map(stocks.map((s) => [s.sku, s]));
  return items.map((i) => {
    const stockSku = pileBySku.get(i.sku)!;
    const st = stockBy.get(stockSku);
    const onHand = st?.onHand ?? 0;
    const inf = infoStockFor(i.sku);
    return {
      id: String(i._id),
      sku: i.sku,
      stockSku,
      stockName: stockSku === i.sku ? null : stockNameBy.get(stockSku) ?? null,
      name: nameBy.get(i.sku) ?? i.sku,
      category: categoryBy.get(i.sku) ?? '',
      color: colorBy.get(i.sku) ?? '',
      qty: i.qty,
      channel: i.channel ?? null,
      orderId: i.orderId ?? null,
      trackingId: i.trackingId ?? null,
      createdAt: (i.createdAt as unknown as Date).toISOString(),
      placedAt: i.placedAt ? (i.placedAt as unknown as Date).toISOString() : null,
      shipByAt: i.shipByAt ? (i.shipByAt as unknown as Date).toISOString() : null,
      onHand,
      available: onHand - (st?.reserved ?? 0),
      info: inf ? { sku: inf.sku, label: inf.label, onHand: stockBy.get(inf.sku)?.onHand ?? 0 } : null,
      ready: i.ready ?? false,
    };
  });
}

export interface QueueRow {
  id: string;
  sku: string;
  stockSku: string;
  stockName: string | null;
  name: string;
  category: string;
  color: string;
  qty: number;
  channel: string | null;
  /** Units of this row's pile still free for it, once the orders queued ahead of
   *  it have taken theirs. */
  free: number;
  after: number;
  short: boolean;
  info: { sku: string; label: string; onHand: number } | null;
  orderId: string | null;
  trackingId: string | null;
  placedAt: string | null;
  shipByAt: string | null;
  /** Packed and set aside — kept off the print sheet so it isn't packed twice. */
  ready: boolean;
}

/**
 * Hands each physical pile out row by row, in the order the orders came in:
 * the first order to want a garment gets what's on the shelf, and only the
 * rows left over are short. Must run over the WHOLE queue, never a filtered
 * subset — who has a claim on a garment can't depend on which platform tab
 * happens to be open.
 */
export function queueRows(pending: PendingRow[]): QueueRow[] {
  const leftBySku = new Map<string, number>();
  return pending.map((p) => {
    const free = leftBySku.get(p.stockSku) ?? p.onHand;
    leftBySku.set(p.stockSku, Math.max(0, free - p.qty));
    return {
      id: p.id,
      sku: p.sku,
      stockSku: p.stockSku,
      stockName: p.stockName,
      name: p.name,
      category: p.category,
      color: p.color,
      qty: p.qty,
      channel: p.channel,
      free,
      info: p.info,
      orderId: p.orderId,
      trackingId: p.trackingId,
      placedAt: p.placedAt,
      shipByAt: p.shipByAt,
      after: free - p.qty,
      short: p.qty > free,
      ready: p.ready,
    };
  });
}

export interface OrderIdUse {
  /** CANCELLED: marked cancelled before it left (cancelPackedLine) — never to be queued again. */
  where: 'QUEUE' | 'SHIPPED' | 'CANCELLED';
  /** Queue rows only: the row's id, so the order-alert app can cancel exactly these rows. */
  id?: string;
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
    StockMovementModel.find({ orderId: id, type: { $in: [MovementType.SOLD, MovementType.CANCELLED] } }).sort({ createdAt: -1 }).lean(),
  ]);
  const skus = [...new Set([...queued, ...shipped].map((r) => r.sku))];
  const products = await ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1 }).lean();
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));

  return [
    ...queued.map((q) => ({
      where: 'QUEUE' as const,
      id: String(q._id),
      sku: q.sku,
      name: nameBy.get(q.sku) ?? q.sku,
      qty: q.qty,
      channel: q.channel ?? null,
      at: null,
    })),
    ...shipped.map((s) => ({
      where: s.type === MovementType.CANCELLED ? ('CANCELLED' as const) : ('SHIPPED' as const),
      sku: s.sku,
      name: nameBy.get(s.sku) ?? s.sku,
      qty: s.type === MovementType.CANCELLED ? s.cancelledQty ?? 0 : Math.abs(s.qty),
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
export async function shipPending(id: string, qty?: number, trackingId?: string, orderId?: string, skipFairnessCheck = false) {
  await connectDB();
  const p = await PendingShipmentModel.findById(id);
  if (!p) throw new Error('Item not found');
  const shipQty = qty && qty > 0 ? Math.min(Math.floor(qty), p.qty) : p.qty;

  // FIFO fairness, enforced not just displayed: queueRows() shows each row's
  // "free" share assuming every order queued ahead of it on the same pile
  // gets served first. Without re-checking that here, shipping is really
  // "whoever's ship button gets clicked first, regardless of queue
  // position" — on an oversold pile, a later order could take the stock an
  // earlier one was shown as entitled to, silently starving it. Recomputed
  // fresh (not cached) so it reflects the queue as it stands right now.
  if (!skipFairnessCheck) {
    const row = queueRows(await listPending()).find((r) => r.id === id);
    if (row && shipQty > row.free) {
      throw new Error(
        row.free <= 0
          ? `An earlier-queued order has first claim on this stock — ship that one first.`
          : `Only ${row.free} available for this order right now — an earlier-queued order has first claim on the rest. Ship that one first, or ship ${row.free} here.`,
      );
    }
  }

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
  const pool = await stockSkuFor(p.sku);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Never let a shipment drive stock below zero, even when the API is called
      // directly — postMovement applies its delta unconditionally.
      const enough = await SkuStockModel.findOne(
        { sku: pool, locationCode: MAIN, $expr: { $gte: [{ $subtract: ['$onHand', shipQty] }, 0] } },
        { _id: 1 },
        { session },
      );
      if (!enough) throw new Error(`Not enough stock to ship ${shipQty} × ${p.sku}.`);

      const movementId = await postMovement(session, {
        sku: p.sku,
        locationCode: MAIN,
        qty: -shipQty,
        type: MovementType.SOLD,
        channel: p.channel || undefined,
        refType: 'SHIP',
        trackingId: tracking,
        orderId: order,
      });
      // The Shipped page's date is this order's own ship-by date, not "whatever
      // day someone happened to click Ship" — a 5th-packed, 6th-due order should
      // read as shipped on the 6th. Native driver: Mongoose's timestamps plugin
      // always sets createdAt itself on .create(), so setting it there is a no-op.
      if (p.shipByAt) {
        await StockMovementModel.collection.updateOne({ _id: movementId }, { $set: { createdAt: p.shipByAt } }, { session });
      }
      // The queue row only if it still holds what was read — cancelled (or
      // shipped) at the same moment, this whole shipment is undone instead of
      // releasing a reservation that's already gone.
      const changed =
        shipQty >= p.qty
          ? (await PendingShipmentModel.deleteOne({ _id: p._id, qty: p.qty }, { session })).deletedCount
          : // What's left needs its own label: drop the AWB that just went out, so the
            // remainder doesn't sit in the queue looking like it already shipped.
            (await PendingShipmentModel.updateOne({ _id: p._id, qty: p.qty }, { $inc: { qty: -shipQty }, $unset: { trackingId: '' } }, { session })).modifiedCount;
      if (!changed) throw new Error('This order line changed at the same moment (cancelled or shipped) — refresh and try again.');
      await SkuStockModel.updateOne({ sku: pool, locationCode: MAIN }, { $inc: { reserved: -shipQty } }, { session });
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
  changes: {
    sku?: string;
    qty?: number;
    channel?: string;
    orderId?: string;
    trackingId?: string;
    placedAt?: string;
    shipByAt?: string;
  },
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
  // Display-only fields — no effect on stock/reservation, so no special handling.
  if (changes.placedAt !== undefined) p.placedAt = changes.placedAt ? new Date(changes.placedAt) : undefined;
  if (changes.shipByAt !== undefined) p.shipByAt = changes.shipByAt ? new Date(changes.shipByAt) : undefined;

  // Move the reservation: release everything held on the old pool, hold the new.
  const oldPool = await stockSkuFor(oldSku);
  const newPool = await stockSkuFor(p.sku);
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
 * Mark a queue entry packed and set aside (or put it back in the pack pile).
 * Purely a print flag — no stock or reservation changes, so it can be flipped
 * either way with nothing to undo.
 */
export async function setPendingReady(id: string, ready: boolean) {
  await connectDB();
  const p = await PendingShipmentModel.findByIdAndUpdate(id, { ready }, { new: true });
  if (!p) throw new Error('Item not found');
  return { id: String(p._id), ready: p.ready ?? false };
}

/**
 * Cancel `qty` units of a queue entry (defaults to the whole entry): release
 * that many reservations, and remove the entry or just reduce its quantity.
 * No stock is deducted.
 */
/**
 * `requestId` (the order-alert bot sends one): a repeat of the same request is
 * answered from its QueueCancel record — what it took the first time —
 * instead of taking more.
 */
export async function cancelPending(id: string, qty?: number, requestId?: string) {
  await connectDB();
  const earlier = requestId ? await QueueCancelModel.findOne({ requestId }).lean() : null;
  if (earlier) return { ok: true, cancelled: earlier.cancelled, repeat: true };
  const remember = async (session: mongoose.ClientSession, cancelled: number) => {
    if (requestId) await QueueCancelModel.create([{ requestId, rowId: String(id), cancelled }], { session });
  };
  // A row that changed between reading and writing (shipped or cancelled at the
  // same moment) is read again; a row that's gone took nothing.
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = await PendingShipmentModel.findById(id);
    // Already gone (shipped or cancelled meanwhile): nothing taken — said
    // explicitly, so a caller never counts it as removed.
    if (!p) {
      if (requestId) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(() => remember(session, 0));
        } catch (err) {
          // Recorded meanwhile by a parallel repeat: answer from it.
          const again = await QueueCancelModel.findOne({ requestId }).lean();
          if (again) return { ok: true, cancelled: again.cancelled, repeat: true };
          throw err;
        } finally {
          await session.endSession();
        }
      }
      return { ok: true, cancelled: 0 };
    }
    const cancelQty = qty && qty > 0 ? Math.min(Math.max(1, Math.floor(qty)), p.qty) : p.qty;
    const pool = await stockSkuFor(p.sku);
    // The queue row and its reservation together, and the row only if it still
    // holds what was read — two changes racing on one row can't both take it.
    let changed = false;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        changed = false;
        const n =
          cancelQty >= p.qty
            ? (await PendingShipmentModel.deleteOne({ _id: p._id, qty: p.qty }, { session })).deletedCount
            : (await PendingShipmentModel.updateOne({ _id: p._id, qty: p.qty }, { $inc: { qty: -cancelQty } }, { session })).modifiedCount;
        if (!n) return;
        await SkuStockModel.updateOne({ sku: pool, locationCode: MAIN }, { $inc: { reserved: -cancelQty } }, { session });
        await remember(session, cancelQty);
        changed = true;
      });
    } catch (err) {
      const again = requestId ? await QueueCancelModel.findOne({ requestId }).lean() : null;
      if (again) return { ok: true, cancelled: again.cancelled, repeat: true };
      throw err;
    } finally {
      await session.endSession();
    }
    if (!changed) continue;
    return {
      ok: true,
      cancelled: cancelQty,
      // Re-queueing these values puts the order back exactly as it was (Undo).
      undo: { sku: p.sku, qty: cancelQty, channel: p.channel ?? undefined, orderId: p.orderId ?? undefined },
    };
  }
  throw new Error('This order line kept changing — refresh and try again.');
}

/**
 * Ship every queued line of one order in a single go — one parcel, one tracking
 * number on all of them. Used when a marketplace order holds several products.
 */
export async function shipOrder(orderId: string, trackingId?: string) {
  await connectDB();
  const id = orderId.trim();
  if (!id) throw new Error('Which order?');
  const allRows = queueRows(await listPending());
  const items = await PendingShipmentModel.find({ orderId: id }).lean();
  if (items.length === 0) throw new Error('Nothing queued for that order');

  let units = 0;
  for (const i of items) {
    const row = allRows.find(r => r.id === String(i._id));
    if (row && i.qty > row.free) throw new Error(`Not enough available stock to ship this entire order right now.`);
    await shipPending(String(i._id), undefined, trackingId, undefined, true);
    units += i.qty;
  }
  return { shipped: items.length, units };
}

/** Pack & ship a chosen set of queue entries (each shipped in full). */
export async function shipSelectedPending(ids: string[]) {
  await connectDB();
  // Oldest first, same reasoning as shipAllPending — the caller's array order
  // (whatever order checkboxes were clicked/collected in) shouldn't decide
  // who gets an oversold pile's stock ahead of an earlier-queued order.
  const allRows = queueRows(await listPending());
  const sortedIds = (await PendingShipmentModel.find({ _id: { $in: ids } }, { _id: 1 }).sort({ createdAt: 1 }).lean()).map((d) =>
    String(d._id),
  );
  let shipped = 0;
  for (const id of sortedIds) {
    const row = allRows.find(r => r.id === id);
    if (row && row.qty > row.free) throw new Error(`Not enough available stock to ship this order right now.`);
    await shipPending(id, undefined, undefined, undefined, true);
    shipped++;
  }
  return { shipped };
}

export async function shipAllPending(channel?: string) {
  await connectDB();
  // Oldest first — matches queueRows()' FIFO order, so on an oversold pile
  // shipPending()'s fairness check never trips mid-batch (each row's turn
  // only comes up once everything queued ahead of it, same pile or not, has
  // already gone through).
  const allRows = queueRows(await listPending());
  const items = await PendingShipmentModel.find(channel ? { channel } : {}).sort({ createdAt: 1 }).lean();
  let shipped = 0;
  for (const i of items) {
    const id = String(i._id);
    const row = allRows.find(r => r.id === id);
    if (row && i.qty > row.free) continue; // skip out-of-stock items for Ship All
    await shipPending(id, undefined, undefined, undefined, true);
    shipped++;
  }
  return { shipped };
}

/**
 * Recompute every SKU's `reserved` counter from the Ready-to-Ship queue itself,
 * and correct any that drifted. `reserved` is a live counter maintained by
 * $inc calls scattered across add/cancel/ship (never a ledger entry, unlike
 * onHand), so a bug anywhere in that chain — or old data from before a bundle
 * mapping existed — can leave it permanently wrong with nothing to self-heal
 * it. Safe to run any time: it only ever sets `reserved` to what the queue
 * actually says right now.
 */
export async function reconcileReservedStock() {
  await connectDB();
  const pending = await PendingShipmentModel.find().lean();
  const actual = new Map<string, number>();
  for (const p of pending) {
    const pool = await stockSkuFor(p.sku);
    actual.set(pool, (actual.get(pool) ?? 0) + p.qty);
  }

  const allStock = await SkuStockModel.find({ locationCode: MAIN }).lean();
  const corrections: { sku: string; from: number; to: number }[] = [];
  const seen = new Set<string>();

  for (const s of allStock) {
    seen.add(s.sku);
    const correct = actual.get(s.sku) ?? 0;
    if (s.reserved !== correct) {
      corrections.push({ sku: s.sku, from: s.reserved, to: correct });
      await SkuStockModel.updateOne({ _id: s._id }, { $set: { reserved: correct } });
    }
  }
  // A pool the queue claims but that has no SkuStock row at all yet (e.g. a
  // brand-new product) — create it so the reservation isn't silently dropped.
  for (const [pool, qty] of actual) {
    if (!seen.has(pool)) {
      corrections.push({ sku: pool, from: 0, to: qty });
      await SkuStockModel.updateOne(
        { sku: pool, locationCode: MAIN },
        { $set: { reserved: qty }, $setOnInsert: { onHand: 0, buffer: 0 } },
        { upsert: true },
      );
    }
  }

  return { checked: allStock.length, corrected: corrections.length, corrections };
}
