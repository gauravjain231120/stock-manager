import { connectDB } from '@/lib/db';
import { MovementType, SystemLocation, PLATFORMS, Platform } from '@/lib/constants';
import { applyMovement } from '@/lib/stock';
import { ProductModel } from '@/models/Product';
import { ReturnShipmentModel } from '@/models/ReturnShipment';

/** An EXPECTED return older than this many days probably never arrived — chase it. */
export const OVERDUE_DAYS = 14;

export type ReturnCondition = 'GOOD' | 'BAD' | 'WRONG';

export interface ReturnRow {
  id: string;
  trackingId: string;
  sku: string;
  name: string;
  channel: string | null;
  orderId: string | null;
  qty: number;
  status: 'EXPECTED' | 'RECEIVED';
  condition: ReturnCondition | null;
  note: string | null;
  initiatedAt: string;
  receivedAt: string | null;
  /** Days since the return was initiated (EXPECTED rows only). */
  waitingDays: number;
  overdue: boolean;
}

/** Tracking IDs are compared without spaces/punctuation so scans always match. */
function normTracking(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Log a return the customer has initiated — the parcel is on its way to you. */
export async function addExpectedReturn(input: {
  trackingId: string;
  sku: string;
  channel?: string;
  orderId?: string;
  qty?: number;
  /** When the customer started the return — defaults to now. Drives the waiting count. */
  date?: Date;
}) {
  await connectDB();
  const trackingId = normTracking(input.trackingId);
  if (!trackingId) throw new Error('Tracking ID is required');
  const sku = input.sku.trim().toUpperCase();
  if (!(await ProductModel.exists({ sku }))) throw new Error('Product not found');
  const qty = Math.floor(input.qty ?? 1);
  if (!(qty >= 1)) throw new Error('Quantity must be at least 1');

  const clash = await ReturnShipmentModel.exists({ trackingId });
  if (clash) throw new Error(`Tracking ${trackingId} is already in the list`);

  const channel = PLATFORMS.includes(input.channel as Platform) ? (input.channel as Platform) : undefined;
  const doc = await ReturnShipmentModel.create({
    trackingId,
    sku,
    channel,
    orderId: input.orderId?.trim() || undefined,
    qty,
    initiatedAt: input.date ?? new Date(),
  });
  return { id: String(doc._id), trackingId };
}

/**
 * Find the expected parcel for a scanned barcode. Falls back to a suffix match so
 * typing just the last few digits works when a barcode won't scan.
 */
export async function findExpectedByTracking(scanned: string) {
  await connectDB();
  const code = normTracking(scanned);
  if (code.length < 3) return null;

  const exact = await ReturnShipmentModel.findOne({ trackingId: code }).lean();
  if (exact) return exact;

  const expected = await ReturnShipmentModel.find({ status: 'EXPECTED' }).lean();
  const matches = expected.filter((r) => r.trackingId.endsWith(code));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Mark a parcel received and apply what was inside:
 *   GOOD   +stock at MAIN (sellable again)
 *   BAD    +stock at DAMAGED (kept out of sellable)
 *   WRONG  no stock at all — you never got your product back, so claim it
 */
export async function receiveReturn(id: string, condition: ReturnCondition, note?: string) {
  await connectDB();
  const rec = await ReturnShipmentModel.findById(id);
  if (!rec) throw new Error('Return not found');
  if (rec.status === 'RECEIVED') throw new Error('This parcel is already marked received');

  if (condition === 'GOOD' || condition === 'BAD') {
    await applyMovement({
      sku: rec.sku,
      locationCode: condition === 'GOOD' ? SystemLocation.MAIN : SystemLocation.DAMAGED,
      qty: rec.qty,
      type: MovementType.RETURNED,
      channel: rec.channel || undefined,
      refType: 'RETURN_SCAN',
      refId: String(rec._id),
      note: note?.trim() || undefined,
    });
  }

  rec.status = 'RECEIVED';
  rec.condition = condition;
  rec.receivedAt = new Date();
  if (note?.trim()) rec.note = note.trim();
  await rec.save();
  return { sku: rec.sku, qty: rec.qty, condition };
}

/**
 * Fix the details of a parcel that hasn't arrived yet — wrong tracking number,
 * wrong size picked, and so on. Nothing has touched stock at this point, so every
 * field is safe to change. Received parcels are locked.
 */
export async function updateExpectedReturn(
  id: string,
  changes: { trackingId?: string; sku?: string; channel?: string; orderId?: string; qty?: number; date?: Date },
) {
  await connectDB();
  const rec = await ReturnShipmentModel.findById(id);
  if (!rec) throw new Error('Return not found');
  if (rec.status === 'RECEIVED') throw new Error('Already received — it cannot be edited');

  if (changes.trackingId !== undefined) {
    const trackingId = normTracking(changes.trackingId);
    if (!trackingId) throw new Error('Tracking ID is required');
    if (trackingId !== rec.trackingId) {
      const clash = await ReturnShipmentModel.exists({ trackingId, _id: { $ne: rec._id } });
      if (clash) throw new Error(`Tracking ${trackingId} is already in the list`);
      rec.trackingId = trackingId;
    }
  }

  if (changes.sku !== undefined) {
    const sku = changes.sku.trim().toUpperCase();
    if (!(await ProductModel.exists({ sku }))) throw new Error('Product not found');
    rec.sku = sku;
  }

  if (changes.qty !== undefined) {
    const qty = Math.floor(changes.qty);
    if (!(qty >= 1)) throw new Error('Quantity must be at least 1');
    rec.qty = qty;
  }

  if (changes.channel !== undefined) {
    rec.channel = PLATFORMS.includes(changes.channel as Platform) ? (changes.channel as Platform) : undefined;
  }
  if (changes.orderId !== undefined) rec.orderId = changes.orderId.trim() || undefined;
  if (changes.date !== undefined) rec.initiatedAt = changes.date;

  await rec.save();
  return { id: String(rec._id), trackingId: rec.trackingId };
}

/** Remove an expected return added by mistake. Received ones can't be deleted. */
export async function deleteExpectedReturn(id: string) {
  await connectDB();
  const rec = await ReturnShipmentModel.findById(id);
  if (!rec) return { ok: true };
  if (rec.status === 'RECEIVED') throw new Error('Already received — it cannot be removed');
  await ReturnShipmentModel.deleteOne({ _id: rec._id });
  return {
    ok: true,
    // Re-adding these values puts the expected return back as it was (Undo).
    undo: {
      trackingId: rec.trackingId,
      sku: rec.sku,
      channel: rec.channel ?? undefined,
      orderId: rec.orderId ?? undefined,
      qty: rec.qty,
      date: (rec.initiatedAt as unknown as Date).toISOString(),
    },
  };
}

export async function listReturnShipments(limit = 500): Promise<ReturnRow[]> {
  await connectDB();
  const items = await ReturnShipmentModel.find().sort({ initiatedAt: -1 }).limit(limit).lean();
  const skus = [...new Set(items.map((i) => i.sku))];
  const products = await ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1 }).lean();
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));
  const now = Date.now();

  return items.map((i) => {
    const initiated = i.initiatedAt as unknown as Date;
    const waitingDays = Math.floor((now - initiated.getTime()) / 86_400_000);
    return {
      id: String(i._id),
      trackingId: i.trackingId,
      sku: i.sku,
      name: nameBy.get(i.sku) ?? i.sku,
      channel: i.channel ?? null,
      orderId: i.orderId ?? null,
      qty: i.qty,
      status: i.status as 'EXPECTED' | 'RECEIVED',
      condition: (i.condition as ReturnCondition | null) ?? null,
      note: i.note ?? null,
      initiatedAt: initiated.toISOString(),
      receivedAt: i.receivedAt ? (i.receivedAt as unknown as Date).toISOString() : null,
      waitingDays,
      overdue: i.status === 'EXPECTED' && waitingDays >= OVERDUE_DAYS,
    };
  });
}

/** Count of parcels still on their way — used for the sidebar badge. */
export async function expectedReturnCount(): Promise<number> {
  await connectDB();
  return ReturnShipmentModel.countDocuments({ status: 'EXPECTED' });
}
