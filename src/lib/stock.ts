import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { MovementType, SystemLocation, stockSkuFor } from '@/lib/constants';
import { StockMovementModel } from '@/models/StockMovement';
import { SkuStockModel } from '@/models/SkuStock';

/**
 * StockService — the only thing allowed to change stock.
 *
 * Two primitives:
 *   applyMovement()  unconditional signed delta (PRODUCED, ADJUSTED, RETURNED_*,
 *                    TRANSFERRED). Records a ledger row AND updates the cache in
 *                    one transaction.
 *   sellUnits()      guarded atomic decrement for sales — refuses to oversell.
 *
 * Both keep the SkuStock cache exactly in step with the StockMovement ledger.
 */

export class InsufficientStockError extends Error {
  constructor(sku: string, locationCode: string, requested: number) {
    super(`Insufficient stock for ${sku} @ ${locationCode}: requested ${requested}`);
    this.name = 'InsufficientStockError';
  }
}

export interface MovementInput {
  sku: string;
  locationCode: string;
  /** Signed delta to on-hand (e.g. +100 produced, -2 correction). */
  qty: number;
  type: MovementType;
  /** Platform for Ship/Return entries (AMAZON / FLIPKART / MYNTRA / OWN_SITE). */
  channel?: string;
  refType?: string;
  refId?: string;
  note?: string;
}

function norm(s: string) {
  return s.trim().toUpperCase();
}

/**
 * Append a ledger row and apply its signed delta to the SkuStock cache, USING AN
 * EXISTING session. This is the building block other services compose into their
 * own transactions (e.g. a production batch posts material consumption AND the
 * finished-goods PRODUCED movement in one atomic unit). Not guarded against going
 * negative — for sales use `sellUnits`.
 */
export async function postMovement(session: mongoose.ClientSession, input: MovementInput) {
  const sku = norm(input.sku);
  const locationCode = norm(input.locationCode);
  const [movement] = await StockMovementModel.create([{ ...input, sku, locationCode }], { session });
  // Bundles: the ledger row stays on the bundle SKU, the physical units on the component.
  await SkuStockModel.updateOne(
    { sku: stockSkuFor(sku), locationCode },
    { $inc: { onHand: input.qty } },
    { session, upsert: true },
  );
  return movement._id;
}

/**
 * Append a ledger row and apply its signed delta to the SkuStock cache, atomically.
 * Use for PRODUCED / ADJUSTED / RETURNED / TRANSFERRED. For sales use `sellUnits`.
 */
export async function applyMovement(input: MovementInput) {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    let movementId: mongoose.Types.ObjectId | undefined;
    await session.withTransaction(async () => {
      movementId = await postMovement(session, input);
    });
    return movementId!;
  } finally {
    await session.endSession();
  }
}

/**
 * Sell (ship) `qty` units. Atomically guards `(onHand - reserved) >= qty` so two
 * concurrent orders can never both take the last unit. Throws
 * InsufficientStockError if not enough is available.
 */
export async function sellUnits(args: {
  sku: string;
  locationCode: string;
  qty: number;
  channel?: string;
  refType?: string;
  refId?: string;
  note?: string;
}) {
  if (args.qty <= 0) throw new Error('sellUnits qty must be positive');
  await connectDB();
  const sku = norm(args.sku);
  const locationCode = norm(args.locationCode);

  const session = await mongoose.startSession();
  try {
    let movementId: mongoose.Types.ObjectId | undefined;
    await session.withTransaction(async () => {
      // Atomic, conditional decrement. If the guard fails, no doc matches and we
      // get null -> abort the transaction.
      const updated = await SkuStockModel.findOneAndUpdate(
        {
          sku: stockSkuFor(sku),
          locationCode,
          $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, args.qty] },
        },
        { $inc: { onHand: -args.qty } },
        { session, returnDocument: 'after' },
      );

      if (!updated) {
        throw new InsufficientStockError(sku, locationCode, args.qty);
      }

      const [mv] = await StockMovementModel.create(
        [
          {
            sku,
            locationCode,
            qty: -args.qty,
            type: MovementType.SOLD,
            channel: args.channel,
            refType: args.refType,
            refId: args.refId,
            note: args.note,
          },
        ],
        { session },
      );
      movementId = mv._id;
    });
    return movementId;
  } finally {
    await session.endSession();
  }
}

/**
 * Move `qty` of a SKU between two locations atomically (e.g. grade a return:
 * QUARANTINE -> MAIN, or QUARANTINE -> DAMAGED). Guards that the source has
 * enough on-hand. Writes two TRANSFERRED ledger rows (out of source, into dest)
 * linked by the same ref, plus updates both caches, in one transaction.
 */
export async function transferStock(args: {
  sku: string;
  fromLocation: string;
  toLocation: string;
  qty: number;
  refType?: string;
  refId?: string;
  note?: string;
}) {
  if (args.qty <= 0) throw new Error('transferStock qty must be positive');
  await connectDB();
  const sku = norm(args.sku);
  const from = norm(args.fromLocation);
  const to = norm(args.toLocation);
  if (from === to) throw new Error('transferStock from and to must differ');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const dec = await SkuStockModel.findOneAndUpdate(
        { sku: stockSkuFor(sku), locationCode: from, $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, args.qty] } },
        { $inc: { onHand: -args.qty } },
        { session, returnDocument: 'after' },
      );
      if (!dec) throw new InsufficientStockError(sku, from, args.qty);

      await SkuStockModel.updateOne(
        { sku: stockSkuFor(sku), locationCode: to },
        { $inc: { onHand: args.qty } },
        { session, upsert: true },
      );

      await StockMovementModel.create(
        [
          { sku, locationCode: from, qty: -args.qty, type: MovementType.TRANSFERRED, refType: args.refType, refId: args.refId, note: args.note },
          { sku, locationCode: to, qty: args.qty, type: MovementType.TRANSFERRED, refType: args.refType, refId: args.refId, note: args.note },
        ],
        { session, ordered: true },
      );
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Set a SKU's current stock to an exact number (e.g. after a physical count).
 * Records the difference as an ADJUSTED movement so the ledger stays auditable.
 */
export async function setStock(sku: string, newOnHand: number) {
  if (newOnHand < 0) throw new Error('Stock cannot be negative');
  await connectDB();
  const s = norm(sku);
  const loc = SystemLocation.MAIN;
  const cur = await SkuStockModel.findOne({ sku: stockSkuFor(s), locationCode: loc }).lean();
  const current = cur?.onHand ?? 0;
  const diff = newOnHand - current;
  if (diff !== 0) {
    await applyMovement({
      sku: s,
      locationCode: loc,
      qty: diff,
      type: MovementType.ADJUSTED,
      refType: 'CORRECTION',
      note: `Stock set to ${newOnHand}`,
    });
  }
  return { sku: s, onHand: newOnHand, diff };
}

/** Current cached stock for a single (sku, location), or zeros if none yet. */
export async function getStock(sku: string, locationCode: string) {
  await connectDB();
  const doc = await SkuStockModel.findOne({
    sku: stockSkuFor(norm(sku)),
    locationCode: norm(locationCode),
  }).lean();
  const onHand = doc?.onHand ?? 0;
  const reserved = doc?.reserved ?? 0;
  const buffer = doc?.buffer ?? 0;
  return { onHand, reserved, buffer, available: onHand - reserved };
}

/**
 * Recompute on-hand straight from the ledger (the source of truth) and compare it
 * to the cache. Used by the verify script and a periodic integrity check — if any
 * row drifts, the cache is wrong.
 */
export async function reconcileFromLedger() {
  await connectDB();

  const ledger = await StockMovementModel.aggregate<{
    _id: { sku: string; locationCode: string };
    onHand: number;
  }>([
    {
      $group: {
        _id: { sku: '$sku', locationCode: '$locationCode' },
        onHand: { $sum: '$qty' },
      },
    },
  ]);

  const cache = await SkuStockModel.find().lean();
  const cacheMap = new Map(cache.map((c) => [`${c.sku}|${c.locationCode}`, c.onHand]));

  // Bundle ledger rows live on the bundle SKU but their stock on the component —
  // fold ledger sums onto the stock SKU before comparing with the cache.
  const folded = new Map<string, { sku: string; locationCode: string; onHand: number }>();
  for (const l of ledger) {
    const sku = stockSkuFor(l._id.sku);
    const key = `${sku}|${l._id.locationCode}`;
    const e = folded.get(key) ?? { sku, locationCode: l._id.locationCode, onHand: 0 };
    e.onHand += l.onHand;
    folded.set(key, e);
  }

  const rows = [...folded.values()].map((l) => {
    const key = `${l.sku}|${l.locationCode}`;
    const cached = cacheMap.get(key) ?? 0;
    return {
      sku: l.sku,
      locationCode: l.locationCode,
      ledgerOnHand: l.onHand,
      cachedOnHand: cached,
      inSync: l.onHand === cached,
    };
  });

  return { rows, allInSync: rows.every((r) => r.inSync) };
}

/**
 * Made / Sold / Returned totals straight from the ledger, optionally for one SKU.
 * This is the report that answers the four core questions.
 */
export async function movementSummary(sku?: string) {
  await connectDB();
  const match = sku ? { sku: norm(sku) } : {};
  const byType = await StockMovementModel.aggregate<{ _id: string; total: number }>([
    { $match: match },
    { $group: { _id: '$type', total: { $sum: '$qty' } } },
  ]);

  const get = (t: string) => byType.find((b) => b._id === t)?.total ?? 0;
  return {
    made: get(MovementType.PRODUCED),
    sold: -get(MovementType.SOLD), // stored negative; report as positive count
    returned: get(MovementType.RETURNED),
    adjusted: get(MovementType.ADJUSTED),
  };
}
