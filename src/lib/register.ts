import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { MovementType, SystemLocation, cleanTracking, ReturnCondition } from '@/lib/constants';
import { stockSkuFor } from '@/lib/stockShare';
import { applyMovement, sellUnits } from '@/lib/stock';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';
import { StockMovementModel } from '@/models/StockMovement';
import { SkuStockModel } from '@/models/SkuStock';
import { LocationModel } from '@/models/Location';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { autoAddToDayReport } from '@/lib/returnReports';
import { VariantMeta, attrsOf, variantMeta } from '@/lib/variants';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// A mistaken shipment moved back to the queue is, by definition, already due —
// so it lands on today's IST calendar day rather than some arbitrary default.
function todayIstEndOfDay(): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 23, 59, 59, 999) - IST_OFFSET_MS);
}

export type RegisterAction = 'PRODUCE' | 'SHIP' | 'RETURN';
export const REGISTER_ACTIONS: RegisterAction[] = ['PRODUCE', 'SHIP', 'RETURN'];

/**
 * The simple "Stock Log": record one of three everyday actions against a SKU.
 *   PRODUCE  +stock   made some units
 *   SHIP     -stock   sent units to customers (refused if not enough stock)
 *   RETURN   +stock   units came back, good to resell
 * (An exchange = Return the old item + Ship the replacement.)
 */
// Movement types shown in the Stock Log as editable/deletable entries —
// includes opening-stock adjustments from creating a product.
const EDITABLE_TYPES: string[] = [
  MovementType.PRODUCED,
  MovementType.SOLD,
  MovementType.RETURNED,
  MovementType.ADJUSTED,
];

// Only the real stock actions show in the "All entries" list. Opening balances
// and direct stock-quantity edits (ADJUSTED) are intentionally hidden.
const LISTED_TYPES: string[] = [MovementType.PRODUCED, MovementType.SOLD, MovementType.RETURNED];

export async function recordEntry(
  sku: string,
  action: RegisterAction,
  qty: number,
  channel?: string,
  date?: Date,
  trackingId?: string,
  condition?: ReturnCondition,
) {
  if (qty <= 0) throw new Error('Quantity must be greater than 0');
  const s = sku.trim().toUpperCase();
  const loc = SystemLocation.MAIN;
  // Same normalising as the ship queue, so a scan and a typed number match.
  const tracking = cleanTracking(trackingId);

  let movementId: mongoose.Types.ObjectId | undefined;
  switch (action) {
    case 'PRODUCE':
      movementId = await applyMovement({ sku: s, locationCode: loc, qty, type: MovementType.PRODUCED, refType: 'REGISTER' });
      break;
    case 'RETURN': {
      // Good and used parcels both go back on the shelf (used is just flagged);
      // a wrong item was never ours (parked in DAMAGED to be claimed) and a
      // defective one won't be resold (parked in DAMAGED too) — neither adds
      // to sellable stock.
      const cond: ReturnCondition = condition ?? 'GOOD';
      const notSellable = cond === 'WRONG' || cond === 'DEFECTIVE';
      movementId = await applyMovement({
        sku: s,
        locationCode: notSellable ? SystemLocation.DAMAGED : loc,
        qty,
        type: MovementType.RETURNED,
        channel,
        refType: 'REGISTER',
        trackingId: tracking,
        condition: cond,
      });
      break;
    }
    case 'SHIP':
      movementId = await sellUnits({ sku: s, locationCode: loc, qty, channel, refType: 'REGISTER', trackingId: tracking });
      break;
    default:
      throw new Error(`Unknown action ${action}`);
  }

  // Backdate the entry if a date was given (e.g. "shipped last week").
  // Use the native driver so Mongoose's timestamp handling doesn't override it.
  if (date && movementId) {
    await StockMovementModel.collection.updateOne({ _id: movementId }, { $set: { createdAt: date } });
  }

  // A scanned Myntra return also lands on that day's return report, so the
  // report builds itself and pasting Myntra's list later shows the difference.
  if (action === 'RETURN' && channel && tracking) {
    await autoAddToDayReport(channel, tracking, date ?? new Date());
  }
  return movementId;
}

/**
 * Edit a Stock Log entry: quantity, platform, date, tracking, order number,
 * (returns only) condition, or — also returns only — the product itself, for
 * correcting a return logged against the wrong SKU.
 *
 * The row is updated in place and only the DIFFERENCE in quantity is applied to
 * stock. Editing just a tracking number touches no stock at all, and a quantity
 * change is refused only when the difference itself can't be applied — not when
 * the original units happen to have been shipped since.
 *
 * A return's condition decides where its units live: Wrong item and Defective
 * are both held in DAMAGED (never resold), Good/Used both sit in MAIN. So
 * changing condition across that line moves the whole quantity between
 * locations, not just a delta.
 * Changing the SKU is the same idea one level up: the whole quantity moves off
 * the old product's pile and onto the new one's, instead of a delta on one pile.
 */
export async function editEntry(
  id: string,
  changes: {
    sku?: string;
    qty?: number;
    channel?: string | null;
    date?: Date;
    trackingId?: string;
    orderId?: string;
    condition?: ReturnCondition;
  },
) {
  await connectDB();
  const mv = await StockMovementModel.findById(id).lean();
  if (!mv) throw new Error('Entry not found');
  if (!EDITABLE_TYPES.includes(mv.type)) throw new Error('This entry cannot be edited');
  const isOutbound = mv.type === MovementType.SOLD;
  const hasPlatform = mv.type === MovementType.SOLD || mv.type === MovementType.RETURNED;
  const isReturn = mv.type === MovementType.RETURNED;

  const newSku = changes.sku?.trim() ? changes.sku.trim().toUpperCase() : mv.sku;
  if (newSku !== mv.sku) {
    if (!isReturn) throw new Error('Only a return can be reassigned to a different product');
    if (!(await ProductModel.exists({ sku: newSku }))) throw new Error(`SKU ${newSku} not found`);
  }

  const newQty = changes.qty != null ? changes.qty : Math.abs(mv.qty);
  if (newQty <= 0) throw new Error('Quantity must be greater than 0');
  const newSignedQty = isOutbound ? -newQty : newQty;

  const newCondition: ReturnCondition | undefined = isReturn
    ? changes.condition ?? (mv.condition as ReturnCondition | null) ?? 'GOOD'
    : undefined;
  const oldLocation = mv.locationCode;
  const newLocation = isReturn
    ? newCondition === 'WRONG' || newCondition === 'DEFECTIVE'
      ? SystemLocation.DAMAGED
      : SystemLocation.MAIN
    : oldLocation;

  // Fields left out of `changes` keep their current value; an empty string clears.
  const fields: Record<string, unknown> = {
    channel: hasPlatform ? changes.channel ?? mv.channel ?? undefined : undefined,
    trackingId: changes.trackingId !== undefined ? cleanTracking(changes.trackingId) : mv.trackingId ?? undefined,
    orderId: changes.orderId !== undefined ? changes.orderId.trim() || undefined : mv.orderId ?? undefined,
    condition: newCondition,
  };
  const set: Record<string, unknown> = {
    sku: newSku,
    qty: newSignedQty,
    createdAt: changes.date ?? (mv.createdAt as unknown as Date),
    locationCode: newLocation,
  };
  const unset: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) unset[key] = '';
    else set[key] = value;
  }

  const oldPool = await stockSkuFor(mv.sku);
  const newPool = newSku === mv.sku ? oldPool : await stockSkuFor(newSku);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (newSku !== mv.sku) {
        // Reassigned to a different product: reverse the whole original effect
        // on the old product's pile, then apply the (possibly re-quantified)
        // new effect on the new one's — a full move, not a same-pile delta.
        const dec = await SkuStockModel.findOneAndUpdate(
          { sku: oldPool, locationCode: oldLocation, $expr: { $gte: [{ $subtract: ['$onHand', mv.qty] }, 0] } },
          { $inc: { onHand: -mv.qty } },
          { session, returnDocument: 'after' },
        );
        if (!dec) throw new Error('Cannot change the product — those units are no longer available to move.');
        await SkuStockModel.updateOne(
          { sku: newPool, locationCode: newLocation },
          { $inc: { onHand: newSignedQty } },
          { session, upsert: true },
        );
      } else if (newLocation !== oldLocation) {
        // Condition crossed the Good/Used <-> Wrong line: move the whole
        // quantity out of the old location and into the new one.
        const dec = await SkuStockModel.findOneAndUpdate(
          { sku: oldPool, locationCode: oldLocation, $expr: { $gte: [{ $subtract: ['$onHand', mv.qty] }, 0] } },
          { $inc: { onHand: -mv.qty } },
          { session, returnDocument: 'after' },
        );
        if (!dec) throw new Error('Cannot change condition — those units are no longer at their current location.');
        await SkuStockModel.updateOne(
          { sku: oldPool, locationCode: newLocation },
          { $inc: { onHand: newSignedQty } },
          { session, upsert: true },
        );
      } else {
        const delta = newSignedQty - mv.qty; // the only stock movement a same-location edit causes
        if (delta !== 0) {
          const upd = await SkuStockModel.findOneAndUpdate(
            { sku: oldPool, locationCode: mv.locationCode, $expr: { $gte: [{ $add: ['$onHand', delta] }, 0] } },
            { $inc: { onHand: delta } },
            { session, returnDocument: 'after' },
          );
          if (!upd) throw new Error('Cannot change the quantity — there is not enough stock for that.');
        }
      }
      await StockMovementModel.updateOne(
        { _id: mv._id },
        Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set },
        { session, timestamps: false },
      );
    });
  } finally {
    await session.endSession();
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
  if (!EDITABLE_TYPES.includes(mv.type)) throw new Error('This entry cannot be deleted here');

  const reverse = -mv.qty; // undo the original stock delta
  const pool = await stockSkuFor(mv.sku);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (reverse !== 0) {
        const upd = await SkuStockModel.findOneAndUpdate(
          { sku: pool, locationCode: mv.locationCode, $expr: { $gte: [{ $add: ['$onHand', reverse] }, 0] } },
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

  // Everything needed to put this entry back if the user hits Undo.
  return {
    undo: {
      sku: mv.sku,
      locationCode: mv.locationCode,
      qty: mv.qty,
      type: mv.type,
      channel: mv.channel ?? undefined,
      refType: mv.refType ?? undefined,
      trackingId: mv.trackingId ?? undefined,
      orderId: mv.orderId ?? undefined,
      note: mv.note ?? undefined,
      createdAt: (mv.createdAt as unknown as Date).toISOString(),
    },
  };
}

/**
 * Undo a shipment that was marked Shipped by mistake: reverses the stock
 * deduction, deletes the Shipped entry, and puts the order straight back on
 * the Ready-to-Ship queue (reserved again, due today) instead of just
 * vanishing it from the books. Only Shipped (SOLD) entries can be moved this
 * way — a Produce or Return has nowhere in the queue to go back to.
 */
export async function moveShippedToQueue(movementId: string) {
  await connectDB();
  const mv = await StockMovementModel.findById(movementId).lean();
  if (!mv) throw new Error('Entry not found');
  if (mv.type !== MovementType.SOLD) throw new Error('Only a shipment can be moved back to the queue');

  const qty = Math.abs(mv.qty);
  const pool = await stockSkuFor(mv.sku);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Put the unit back on the shelf, then immediately reserve it again for
      // the queue — net physical stock is unchanged, only its claim moves.
      await SkuStockModel.updateOne(
        { sku: pool, locationCode: mv.locationCode },
        { $inc: { onHand: qty, reserved: qty }, $setOnInsert: { buffer: 0 } },
        { session, upsert: true },
      );
      await StockMovementModel.deleteOne({ _id: mv._id }, { session });
      await PendingShipmentModel.create(
        [{
          sku: mv.sku,
          qty,
          channel: mv.channel ?? undefined,
          orderId: mv.orderId ?? undefined,
          trackingId: mv.trackingId ?? undefined,
          shipByAt: todayIstEndOfDay(),
        }],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return { ok: true };
}

/** Move several mistaken shipments back to the queue at once (the Shipped page's bulk button). */
export async function moveManyShippedToQueue(ids: string[]) {
  await connectDB();
  let moved = 0;
  for (const id of ids) {
    await moveShippedToQueue(id);
    moved++;
  }
  return { moved };
}

export interface EntrySnapshot {
  sku: string;
  locationCode: string;
  qty: number;
  type: string;
  channel?: string;
  refType?: string;
  trackingId?: string;
  orderId?: string;
  note?: string;
  createdAt: string;
}

/** Put a deleted Stock Log entry back, exactly as it was (the Undo button). */
export async function restoreEntry(snap: EntrySnapshot) {
  await connectDB();
  if (!EDITABLE_TYPES.includes(snap.type)) throw new Error('This entry cannot be restored');
  const createdAt = new Date(snap.createdAt);

  const pool = await stockSkuFor(snap.sku);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (snap.qty > 0) {
        // Putting units back can never go negative, so upsert is safe here.
        await SkuStockModel.updateOne(
          { sku: pool, locationCode: snap.locationCode },
          { $inc: { onHand: snap.qty } },
          { session, upsert: true },
        );
      } else if (snap.qty < 0) {
        // Re-applying a Ship must not drive stock below zero. ($expr can't be
        // combined with upsert, and the row exists if it was shipped from.)
        const upd = await SkuStockModel.findOneAndUpdate(
          { sku: pool, locationCode: snap.locationCode, $expr: { $gte: [{ $add: ['$onHand', snap.qty] }, 0] } },
          { $inc: { onHand: snap.qty } },
          { session, returnDocument: 'after' },
        );
        if (!upd) throw new Error('Cannot undo: not enough stock to put that shipment back.');
      }
      // timestamps:false so the entry keeps its original date.
      await StockMovementModel.create(
        [{
          sku: snap.sku,
          locationCode: snap.locationCode,
          qty: snap.qty,
          type: snap.type as MovementType,
          channel: snap.channel,
          refType: snap.refType,
          trackingId: snap.trackingId,
          orderId: snap.orderId,
          note: snap.note,
          createdAt,
        }],
        { session, timestamps: false },
      );
    });
  } finally {
    await session.endSession();
  }
  return { ok: true };
}

/** Parent product (style) + colour/size are carried so the picker can build its rows. */
export interface RegisterRow extends VariantMeta {
  sku: string;
  name: string;
  produced: number;
  shipped: number;
  returned: number;
  inStock: number;
  /** True for bundles: inStock is another SKU's pool, so don't sum it twice. */
  sharedStock?: boolean;
}

/**
 * Per-product totals for the three actions + current stock. `range` narrows
 * shipped/returned/produced to movements posted in that window (on-hand stays
 * the current physical count either way — it's not a historical quantity).
 */
export async function registerTotals(range?: { from?: Date; to?: Date }): Promise<RegisterRow[]> {
  await connectDB();
  const dateMatch: Record<string, Date> = {};
  if (range?.from) dateMatch.$gte = range.from;
  if (range?.to) dateMatch.$lte = range.to;
  const [products, byType, stock, locations, groups] = await Promise.all([
    ProductModel.find({ active: true }).sort({ sku: 1 }).lean(),
    StockMovementModel.aggregate<{ _id: { sku: string; type: string }; qty: number }>([
      ...(Object.keys(dateMatch).length ? [{ $match: { createdAt: dateMatch } }] : []),
      { $group: { _id: { sku: '$sku', type: '$type' }, qty: { $sum: '$qty' } } },
    ]),
    SkuStockModel.find().lean(),
    LocationModel.find({ kind: 'SELLABLE' }).lean(),
    ProductGroupModel.find({}, { code: 1, name: 1 }).lean(),
  ]);

  const groupNameByCode = new Map(groups.map((g) => [g.code, g.name]));

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

  const pileBySku = new Map(await Promise.all(products.map(async (p) => [p.sku, await stockSkuFor(p.sku)] as const)));

  return products.map((p) => {
    const a = aggBySku.get(p.sku) ?? { produced: 0, shipped: 0, returned: 0 };
    const pool = pileBySku.get(p.sku)!;
    return {
      ...variantMeta(p, p.groupCode ? groupNameByCode.get(p.groupCode) : undefined),
      sku: p.sku,
      name: p.name,
      produced: a.produced,
      shipped: a.shipped,
      returned: a.returned,
      inStock: inStockBySku.get(pool) ?? 0,
      sharedStock: pool !== p.sku || undefined,
    };
  });
}

export interface ProduceRow {
  sku: string;
  name: string;
  shipped: number;
  inStock: number;
  suggest: number;
}

/**
 * Restock worklist: variants that actually sell (shipped > 0) but are now Low
 * (<= 5) or Out of stock, sorted by most-shipped first. `suggest` is a rough
 * make quantity to cover the demand already seen (shipped minus what's on hand).
 */
export async function getProduceList(): Promise<ProduceRow[]> {
  const rows = await registerTotals();
  return rows
    .filter((r) => r.shipped > 0 && r.inStock <= 5)
    .sort((a, b) => b.shipped - a.shipped || a.inStock - b.inStock)
    .map((r) => ({
      sku: r.sku,
      name: r.name,
      shipped: r.shipped,
      inStock: r.inStock,
      suggest: Math.max(1, r.shipped - r.inStock),
    }));
}

export interface EntryProductInfo {
  name: string;
  /** The product's category, e.g. "Coord set" — empty when it has none. */
  category: string;
  color: string;
  size: string;
}

/**
 * sku -> product line name + colour + size, so log entries can show a human
 * label ("Co-ord Set — Blue-Bandhej · XL") above the raw SKU. Includes inactive
 * products because old movements may reference them.
 */
export async function productInfoBySku(): Promise<Map<string, EntryProductInfo>> {
  await connectDB();
  const products = await ProductModel.find({}, { sku: 1, name: 1, category: 1, attributes: 1 }).lean();
  const out = new Map<string, EntryProductInfo>();
  for (const p of products) {
    const attrs = attrsOf(p.attributes);
    out.set(p.sku, {
      name: p.category?.trim() || p.name,
      category: p.category?.trim() ?? '',
      color: attrs.color?.trim() ?? '',
      size: attrs.size?.trim() ?? '',
    });
  }
  return out;
}

/** All stock entries (produce/ship/return + opening-stock adjustments). */
export async function recentEntries(limit = 1000) {
  await connectDB();
  return StockMovementModel.find({ type: { $in: LISTED_TYPES as MovementType[] } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
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
    { $match: { channel: { $ne: null }, type: { $in: [MovementType.SOLD, MovementType.RETURNED] } } },
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
