import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { MovementType, SystemLocation, cleanTracking, ReturnCondition, RETURN_CONDITIONS, ReturnType, RETURN_TYPES } from '@/lib/constants';
import { stockSkuFor } from '@/lib/stockShare';
import { applyMovement, sellUnits } from '@/lib/stock';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';
import { StockMovementModel } from '@/models/StockMovement';
import { SkuStockModel } from '@/models/SkuStock';
import { LocationModel } from '@/models/Location';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { CancelReversalModel } from '@/models/CancelReversal';
import { autoAddToDayReport } from '@/lib/returnReports';
import { VariantMeta, attrsOf, variantMeta } from '@/lib/variants';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// A mistaken shipment moved back to the queue is, by definition, already due —
// so it lands on today's IST calendar day rather than some arbitrary default.
function todayIstEndOfDay(): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 23, 59, 59, 999) - IST_OFFSET_MS);
}

/**
 * A return that's already logged — same tracking number, same product (any
 * brand prefix). A double tap / rescan used to log one parcel twice (found
 * live: MYEP1133606842 × RRC-002-CO-C-RED-M logged twice — Myntra shows that
 * parcel held ONE unit). A parcel CAN hold 2+ units of one product (Myntra
 * lists one claim per unit), so the caller says how many it holds
 * (`expectedUnits`, the bot's scan pages know): up to that many log
 * normally, only extra ones are refused. Without it (a manual entry) any
 * second log of the same tracking + product is refused. Either way the
 * caller can confirm and log anyway (`allowDuplicate`).
 */
export class DuplicateReturnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateReturnError';
  }
}

/** deleteEntry() refused on a stock rule (not a failure — retrying won't change it). */
export class EntryRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntryRuleError';
  }
}

const suffixOf = (sku: string) => {
  const i = sku.indexOf('-');
  return (i === -1 ? sku : sku.slice(i + 1)).trim().toUpperCase();
};

const istDate = (d: Date) =>
  new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

async function assertNotAlreadyReturned(sku: string, tracking: string | undefined, qty: number, expectedUnits?: number, orderId?: string) {
  const earlier = tracking
    ? await StockMovementModel.find(
        { type: MovementType.RETURNED, trackingId: tracking },
        { sku: 1, qty: 1, condition: 1, createdAt: 1 },
      ).lean()
    : [];
  const same = earlier.filter((e) => suffixOf(e.sku) === suffixOf(sku));
  const loggedUnits = same.reduce((sum, e) => sum + Math.abs(e.qty), 0);
  // Units of this order + product whose stock was ALREADY put back when the
  // marketplace cancelled it after it was marked shipped — the RTO parcel
  // arriving now must not add them a second time.
  const reversals = orderId
    ? await CancelReversalModel.find(
        { $or: [{ orderId: orderId.trim() }, { altOrderIds: orderId.trim() }], skuSuffix: suffixOf(sku) },
        { qty: 1, createdAt: 1 },
      ).lean()
    : [];
  const reversedUnits = reversals.reduce((sum, r) => sum + r.qty, 0);
  const accounted = loggedUnits + reversedUnits;
  if (accounted === 0) return;
  // The parcel holds more units of this product than are accounted for so far.
  if (expectedUnits && accounted + qty <= expectedUnits) return;
  const held = expectedUnits ? ` — the parcel holds ${expectedUnits}` : '';
  if (loggedUnits === 0) {
    throw new DuplicateReturnError(
      `Stock for ${reversedUnits} unit${reversedUnits === 1 ? '' : 's'} of this product on order ${orderId} was already put back ` +
        `when the order was cancelled after shipping (${istDate(reversals[0].createdAt as unknown as Date)})${held}. ` +
        `Log it again only if this is an extra unit beyond that.`,
    );
  }
  const first = same[0];
  throw new DuplicateReturnError(
    `Already logged: ${loggedUnits} unit${loggedUnits === 1 ? '' : 's'} of ${first.sku} for ${tracking} (first on ${istDate(first.createdAt as unknown as Date)}` +
      `${first.condition ? `, ${first.condition}` : ''})${reversedUnits ? ` (+${reversedUnits} put back on cancellation)` : ''}${held}. Log it again only if another unit really came back.`,
  );
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
  returnType?: ReturnType,
  // Marketplace order number, when the caller has it (e.g. the bot's Amazon
  // Return page) — returns only; stored exactly as the Edit dialog would.
  orderId?: string,
  // Returns only: log it even if this tracking + product is already logged.
  allowDuplicate = false,
  // Returns only: how many units of this product the parcel holds (when the
  // caller knows) — that many log without a duplicate warning.
  expectedUnits?: number,
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
      if ((tracking || orderId) && !allowDuplicate) {
        await connectDB();
        await assertNotAlreadyReturned(s, tracking, qty, expectedUnits, orderId);
      }
      // Good, used, and faked parcels all go back on the shelf (used/faked are
      // just flagged); a wrong item was never ours (parked in DAMAGED to be
      // claimed) and a defective one won't be resold (parked in DAMAGED too) —
      // neither adds to sellable stock.
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
        // Customer return vs RTO — UNKNOWN unless the caller knows.
        returnType: returnType && RETURN_TYPES.includes(returnType) ? returnType : 'UNKNOWN',
        orderId: orderId && orderId.trim() ? orderId.trim() : undefined,
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
 * are both held in DAMAGED (never resold), Good/Used/Faked all sit in MAIN. So
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
    returnType?: ReturnType;
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
    // Returns only; left alone unless the edit changes it.
    returnType: isReturn ? changes.returnType ?? (mv.returnType as ReturnType | null) ?? undefined : undefined,
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
/**
 * `inTransaction` runs inside the same transaction, after the entry is gone —
 * for a record that must exist exactly when the deletion does (unshipCancelledLine's
 * CancelReversal).
 */
export async function deleteEntry(
  movementId: string,
  { inTransaction }: { inTransaction?: (session: mongoose.ClientSession) => Promise<unknown> } = {},
) {
  await connectDB();
  const mv = await StockMovementModel.findById(movementId).lean();
  if (!mv) throw new EntryRuleError('Entry not found');
  if (!EDITABLE_TYPES.includes(mv.type)) throw new EntryRuleError('This entry cannot be deleted here');

  const reverse = -mv.qty; // undo the original stock delta
  const pool = await stockSkuFor(mv.sku);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // The entry first, and only if it is still there: two deletes of the same
      // entry at once (or a retried transaction) must not undo its stock twice.
      const del = await StockMovementModel.deleteOne({ _id: mv._id }, { session });
      if (!del.deletedCount) throw new EntryRuleError('Entry not found');
      if (reverse !== 0) {
        const upd = await SkuStockModel.findOneAndUpdate(
          { sku: pool, locationCode: mv.locationCode, $expr: { $gte: [{ $add: ['$onHand', reverse] }, 0] } },
          { $inc: { onHand: reverse } },
          { session, returnDocument: 'after' },
        );
        if (!upd) {
          throw new EntryRuleError(
            reverse < 0
              ? 'Cannot delete: those units have already been shipped (stock would go negative).'
              : 'Cannot delete: there is no stock record for this product at that location.',
          );
        }
      }
      if (inTransaction) await inTransaction(session);
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
      condition: mv.condition ?? undefined,
      returnType: mv.returnType ?? undefined,
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
      // The shipment first, and only if it is still there — moved (or deleted)
      // twice at once, its stock must not come back twice.
      const del = await StockMovementModel.deleteOne({ _id: mv._id }, { session });
      if (!del.deletedCount) throw new Error('Entry not found');
      // Put the unit back on the shelf, then immediately reserve it again for
      // the queue — net physical stock is unchanged, only its claim moves.
      await SkuStockModel.updateOne(
        { sku: pool, locationCode: mv.locationCode },
        { $inc: { onHand: qty, reserved: qty }, $setOnInsert: { buffer: 0 } },
        { session, upsert: true },
      );
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

/**
 * Called by the order-alert app when a marketplace reports an order cancelled
 * AFTER it was already shipped (presumed RTO — the courier brings the parcel
 * back) rather than a genuine loss. Restores the stock exactly like
 * deleteEntry() does, but looked up by order+SKU (that app has no way to know
 * a movement's Mongo id) and, unlike moveShippedToQueue(), never re-adds
 * anything to Ready to Ship — there's no live order left to ship it to.
 *
 * Different marketplaces prefix the same variant differently (RRC-/RR-/R-),
 * so this matches by everything after the first "-", same convention as
 * addPending()'s own fallback resolution above.
 *
 * Reverses whole SOLD movements, oldest first, only up to `qty`: if the next
 * candidate movement's own qty would overshoot what's left to reverse, this
 * stops rather than guessing at a partial reversal (deleteEntry has no
 * partial-quantity mode). The caller gets back exactly how much it managed to
 * reverse, so it can flag anything left over for a human to check.
 */
export async function unshipCancelledLine({
  orderId,
  sku,
  qty,
  altOrderIds = [],
  requestId,
}: {
  orderId: string;
  sku: string;
  qty: number;
  /** Other numbers this order goes by (Myntra: the items' portalOrderReleaseIds) — returns may be logged under those. */
  altOrderIds?: string[];
  /**
   * The caller's id for this request. A repeat (its first try timed out after
   * it went through here) counts what that id already reversed instead of
   * reversing more of the order's shipments.
   */
  requestId?: string;
}) {
  await connectDB();
  const idx = sku.indexOf('-');
  const suffix = (idx === -1 ? sku : sku.slice(idx + 1)).trim().toUpperCase();
  const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alts = [...new Set(altOrderIds.map((a) => String(a).trim()).filter(Boolean))].slice(0, 20);

  const already = requestId
    ? await CancelReversalModel.find({ requestId, orderId, skuSuffix: suffix }, { qty: 1, movementIds: 1 }).lean()
    : [];
  const alreadyQty = already.reduce((sum, r) => sum + r.qty, 0);
  const movementIds: string[] = already.flatMap((r) => r.movementIds ?? []);
  let remaining = qty - alreadyQty;

  // Units of this order cancelled here by hand first (cancelPackedLine — the
  // parcel never left) are already back: they count toward this request
  // instead of another shipment being reversed. Each is claimed by this
  // request, so it's counted once (a repeat finds it again by `claimedBy`)
  // and can no longer be undone.
  const claimKey = requestId || `unship:${new mongoose.Types.ObjectId()}`;
  if (requestId) {
    const claimed = await CancelReversalModel.find({ claimedBy: requestId, skuSuffix: suffix }, { qty: 1, movementIds: 1 }).lean();
    remaining -= claimed.reduce((sum, r) => sum + r.qty, 0);
    movementIds.push(...claimed.flatMap((r) => r.movementIds ?? []));
  }
  const claimManual = async () => {
    while (remaining > 0) {
      const manual = await CancelReversalModel.findOneAndUpdate(
        { source: 'MANUAL', claimedBy: null, skuSuffix: suffix, qty: { $lte: remaining }, $or: [{ orderId }, { altOrderIds: orderId }] },
        { $set: { claimedBy: claimKey }, ...(alts.length ? { $addToSet: { altOrderIds: { $each: alts } } } : {}) },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      ).lean();
      if (!manual) return;
      remaining -= manual.qty;
      movementIds.push(...(manual.movementIds ?? []));
    }
  };
  await claimManual();

  const candidates =
    remaining > 0
      ? await StockMovementModel.find({
          orderId,
          type: MovementType.SOLD,
          sku: new RegExp(`-${escaped}$`, 'i'),
        })
          .sort({ createdAt: 1 })
          .lean()
      : [];

  let error: string | undefined;
  for (const mv of candidates) {
    if (remaining <= 0) break;
    const mvQty = Math.abs(mv.qty);
    if (!mvQty) continue;
    if (mvQty > remaining) break; // would overshoot this line's cancelled qty — stop rather than guess
    try {
      // Remembered in the same transaction as the reversal: if this was an RTO,
      // the parcel is scanned back in later and that scan must not add the same
      // stock again (assertNotAlreadyReturned) — and a retry of this request
      // must see it, or it would reverse another shipment instead.
      await deleteEntry(String(mv._id), {
        inTransaction: (session) =>
          CancelReversalModel.create(
            [
              {
                orderId,
                altOrderIds: alts,
                skuSuffix: suffix,
                sku,
                qty: mvQty,
                movementIds: [String(mv._id)],
                ...(requestId ? { requestId } : {}),
              },
            ],
            { session },
          ),
      });
    } catch (err) {
      if (!(err instanceof EntryRuleError)) throw err; // a real failure: the caller retries
      if (err.message === 'Entry not found') continue; // gone meanwhile — not ours to count
      error = err.message;
      break;
    }
    movementIds.push(String(mv._id));
    remaining -= mvQty;
  }

  // Cancelled by hand while the shipments above were being looked at.
  if (!error) await claimManual();

  // Everything this request put back (earlier tries included) — more than
  // `qty` when a repeat asks for less than it already did; the caller must
  // count all of it.
  const reversedQty = qty - remaining;
  return { reversedQty, remaining: Math.max(0, remaining), movementIds, ...(error ? { error } : {}) };
}

/**
 * A packed parcel cancelled by hand before it left — the Order Alerts bot's
 * Myntra Cancel scan (the courier refused it at pickup, or the order was
 * cancelled after packing and the marketplace hasn't said so yet). Up to
 * `qty` units of `sku` on `orderId`, matched by everything after the first
 * "-" like unshipCancelledLine:
 *   1. marked Shipped → that entry stays on the Shipped page, turned into a
 *      CANCELLED one (its −qty goes to 0, so the ledger still adds up), and
 *      its units go back on the shelf;
 *   2. still in Ready to Ship → taken out of the queue (its reservation
 *      released), with a CANCELLED entry (qty 0) so it shows on Shipped as
 *      Cancelled too.
 * Each step is remembered as a MANUAL CancelReversal in the same transaction:
 * a later marketplace cancellation of the order counts it instead of
 * reversing another shipment, a return scan of the order won't add it twice,
 * and a repeat of the same `requestId` only does what earlier tries didn't.
 * A merged Shipped entry holding more units than asked for is left alone
 * (`remaining` says so), like unshipCancelledLine.
 */
export async function cancelPackedLine({
  orderId,
  sku,
  qty,
  trackingId,
  requestId,
  note,
}: {
  orderId: string;
  sku: string;
  qty: number;
  trackingId?: string;
  requestId: string;
  /** Who / why, shown with the Cancelled entry. */
  note?: string;
}) {
  await connectDB();
  const id = orderId.trim();
  const suffix = suffixOf(sku);
  const skuRe = new RegExp(`-${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  let tracking: string | undefined;
  try {
    tracking = cleanTracking(trackingId);
  } catch {
    tracking = undefined; // not a usable tracking number — the entry just keeps what it had
  }
  const cancelNote = note?.trim().slice(0, 200) || 'Cancelled before it left';
  const MAIN = SystemLocation.MAIN;

  // What earlier tries of this very request did.
  const mine = await CancelReversalModel.find({ requestId, source: 'MANUAL' }, { qty: 1, cancelledFrom: 1, movementIds: 1 }).lean();
  let fromShipped = mine.filter((r) => r.cancelledFrom === 'SHIPPED').reduce((sum, r) => sum + r.qty, 0);
  let fromQueue = mine.filter((r) => r.cancelledFrom === 'QUEUE').reduce((sum, r) => sum + r.qty, 0);
  const movementIds: string[] = mine.flatMap((r) => r.movementIds ?? []);
  let remaining = qty - fromShipped - fromQueue;

  // 1. Shipped entries, oldest first.
  if (remaining > 0) {
    const shipped = await StockMovementModel.find({ orderId: id, type: MovementType.SOLD, sku: skuRe }).sort({ createdAt: 1 }).lean();
    for (const mv of shipped) {
      if (remaining <= 0) break;
      const n = Math.abs(mv.qty);
      if (!n || n > remaining) continue;
      const pool = await stockSkuFor(mv.sku);
      let done = false;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          done = false;
          // Only while it is still that Shipped entry — deleted, moved back or
          // cancelled at the same moment, its stock must not come back twice.
          const upd = await StockMovementModel.updateOne(
            { _id: mv._id, type: MovementType.SOLD, qty: mv.qty },
            {
              $set: {
                type: MovementType.CANCELLED,
                qty: 0,
                cancelledQty: n,
                cancelledAt: new Date(),
                cancelledFrom: 'SHIPPED',
                cancelNote,
                ...(tracking && !mv.trackingId ? { trackingId: tracking } : {}),
              },
            },
            { session },
          );
          if (!upd.modifiedCount) return;
          await SkuStockModel.updateOne(
            { sku: pool, locationCode: mv.locationCode },
            { $inc: { onHand: n }, $setOnInsert: { reserved: 0, buffer: 0 } },
            { session, upsert: true },
          );
          await CancelReversalModel.create(
            [{ orderId: id, altOrderIds: [], skuSuffix: suffix, sku: mv.sku, qty: n, movementIds: [String(mv._id)], requestId, source: 'MANUAL', cancelledFrom: 'SHIPPED' }],
            { session },
          );
          done = true;
        });
      } finally {
        await session.endSession();
      }
      if (!done) continue;
      movementIds.push(String(mv._id));
      fromShipped += n;
      remaining -= n;
    }
  }

  // 2. Still in Ready to Ship, oldest first.
  if (remaining > 0) {
    const queued = await PendingShipmentModel.find({ orderId: id, sku: skuRe }).sort({ createdAt: 1 }).lean();
    for (const row of queued) {
      if (remaining <= 0) break;
      const take = Math.min(row.qty, remaining);
      const pool = await stockSkuFor(row.sku);
      let markerId = '';
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          markerId = '';
          // The row only if it still holds what was read (shipped or cancelled
          // at the same moment, it's left to that).
          const changed =
            take >= row.qty
              ? (await PendingShipmentModel.deleteOne({ _id: row._id, qty: row.qty }, { session })).deletedCount
              : (await PendingShipmentModel.updateOne({ _id: row._id, qty: row.qty }, { $inc: { qty: -take } }, { session })).modifiedCount;
          if (!changed) return;
          await SkuStockModel.updateOne({ sku: pool, locationCode: MAIN }, { $inc: { reserved: -take } }, { session });
          const at = new Date();
          // Dated like a shipment (its ship-by day), so it sits on the Shipped
          // page where it would have been. timestamps:false keeps that date.
          const [marker] = await StockMovementModel.create(
            [
              {
                sku: row.sku,
                locationCode: MAIN,
                qty: 0,
                type: MovementType.CANCELLED,
                channel: row.channel ?? undefined,
                refType: 'CANCEL',
                orderId: id,
                trackingId: tracking ?? row.trackingId ?? undefined,
                cancelledQty: take,
                cancelledAt: at,
                cancelledFrom: 'QUEUE',
                cancelNote,
                createdAt: row.shipByAt ?? at,
              },
            ],
            { session, timestamps: false },
          );
          await CancelReversalModel.create(
            [
              {
                orderId: id,
                altOrderIds: [],
                skuSuffix: suffix,
                sku: row.sku,
                qty: take,
                movementIds: [String(marker._id)],
                requestId,
                source: 'MANUAL',
                cancelledFrom: 'QUEUE',
                queueRows: [
                  {
                    sku: row.sku,
                    qty: take,
                    channel: row.channel ?? undefined,
                    orderId: row.orderId ?? undefined,
                    trackingId: row.trackingId ?? undefined,
                    buyer: row.buyer ?? undefined,
                    placedAt: row.placedAt ?? undefined,
                    shipByAt: row.shipByAt ?? undefined,
                    ready: row.ready ?? false,
                    createdAt: row.createdAt ?? undefined,
                  },
                ],
              },
            ],
            { session },
          );
          markerId = String(marker._id);
        });
      } finally {
        await session.endSession();
      }
      if (!markerId) continue;
      movementIds.push(markerId);
      fromQueue += take;
      remaining -= take;
    }
  }

  // Put back for this order + product some other way already — the
  // marketplace's own cancellation, or another scan — so the caller can say
  // why nothing was left to change.
  const others = await CancelReversalModel.find(
    { $or: [{ orderId: id }, { altOrderIds: id }], skuSuffix: suffix, requestId: { $ne: requestId } },
    { qty: 1 },
  ).lean();
  const alreadyBack = others.reduce((sum, r) => sum + r.qty, 0);

  return {
    cancelled: fromShipped + fromQueue,
    fromShipped,
    fromQueue,
    remaining: Math.max(0, remaining),
    alreadyBack,
    movementIds,
  };
}

const CLAIMED_MESSAGE = 'The marketplace has since cancelled this order too, so it stays cancelled — nothing to undo.';

/**
 * Undo cancelPackedLine (the parcel was marked cancelled by mistake): each
 * Shipped entry it turned Cancelled is Shipped again (its units taken off the
 * shelf again), each queue row it took out goes back where it was in the
 * queue (reserved again). Refused once the marketplace's own cancellation has
 * counted it (`claimedBy`), or when the units put back have been used since.
 */
export async function undoPackedCancel(requestId: string) {
  await connectDB();
  const mine = await CancelReversalModel.find({ requestId, source: 'MANUAL' }).sort({ createdAt: 1 }).lean();
  if (mine.some((r) => r.claimedBy)) throw new EntryRuleError(CLAIMED_MESSAGE);
  const MAIN = SystemLocation.MAIN;
  let undone = 0;
  for (const r of mine) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Checked again inside: a marketplace cancellation claiming it at the
        // same moment wins.
        const del = await CancelReversalModel.deleteOne({ _id: r._id, claimedBy: null }, { session });
        if (!del.deletedCount) throw new EntryRuleError(CLAIMED_MESSAGE);
        const mvId = r.movementIds?.[0];
        const mv = mvId ? await StockMovementModel.findById(mvId, null, { session }).lean() : null;
        if (r.cancelledFrom === 'SHIPPED') {
          if (!mv || mv.type !== MovementType.CANCELLED) throw new EntryRuleError('Its Shipped entry was changed since — fix it by hand on the Shipped page.');
          const n = mv.cancelledQty ?? r.qty;
          const pool = await stockSkuFor(mv.sku);
          const upd = await SkuStockModel.findOneAndUpdate(
            { sku: pool, locationCode: mv.locationCode, $expr: { $gte: [{ $subtract: ['$onHand', n] }, 0] } },
            { $inc: { onHand: -n } },
            { session, returnDocument: 'after' },
          );
          if (!upd) throw new EntryRuleError(`Can't undo: the ${n} unit${n === 1 ? '' : 's'} put back ${n === 1 ? 'has' : 'have'} been used since (stock would go negative).`);
          await StockMovementModel.updateOne(
            { _id: mv._id, type: MovementType.CANCELLED },
            { $set: { type: MovementType.SOLD, qty: -n }, $unset: { cancelledQty: '', cancelledAt: '', cancelledFrom: '', cancelNote: '' } },
            { session },
          );
        } else {
          for (const q of r.queueRows ?? []) {
            const pool = await stockSkuFor(q.sku!);
            await SkuStockModel.updateOne(
              { sku: pool, locationCode: MAIN },
              { $inc: { reserved: q.qty! }, $setOnInsert: { onHand: 0, buffer: 0 } },
              { session, upsert: true },
            );
            await PendingShipmentModel.create(
              [
                {
                  sku: q.sku!,
                  qty: q.qty!,
                  channel: q.channel ?? undefined,
                  orderId: q.orderId ?? undefined,
                  trackingId: q.trackingId ?? undefined,
                  buyer: q.buyer ?? undefined,
                  placedAt: q.placedAt ?? undefined,
                  shipByAt: q.shipByAt ?? undefined,
                  ready: q.ready ?? false,
                  createdAt: q.createdAt ?? new Date(),
                  updatedAt: new Date(),
                },
              ],
              { session, timestamps: false },
            );
          }
          if (mv && mv.type === MovementType.CANCELLED) await StockMovementModel.deleteOne({ _id: mv._id }, { session });
        }
      });
    } finally {
      await session.endSession();
    }
    undone += r.qty;
  }
  return { undone };
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
  /** Returns only — restored too, so an undone return keeps its grading. */
  condition?: string;
  returnType?: string;
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
          ...(snap.type === MovementType.RETURNED
            ? {
                condition: RETURN_CONDITIONS.includes(snap.condition as ReturnCondition) ? (snap.condition as ReturnCondition) : undefined,
                returnType: RETURN_TYPES.includes(snap.returnType as ReturnType) ? (snap.returnType as ReturnType) : undefined,
              }
            : {}),
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
