import { connectDB } from '@/lib/db';
import { Channel, CHANNELS, MovementType, SystemLocation } from '@/lib/constants';
import { getAdapter } from '@/lib/marketplace/registry';
import { applyMovement, transferStock } from '@/lib/stock';
import { syncSkus } from '@/lib/sync';
import { ChannelListingModel } from '@/models/ChannelListing';
import { ReturnRecordModel } from '@/models/ReturnRecord';
import { SyncStateModel } from '@/models/SyncState';

export interface ReturnIngestResult {
  channel: Channel;
  pulled: number;
  received: number;
  unmapped: number;
}

/**
 * Pull returns for one channel. Each returned unit lands in QUARANTINE (a RETURNED
 * movement) and a ReturnRecord is created in status RECEIVED, awaiting grading.
 * Idempotent on (channel, channelReturnId).
 */
export async function ingestReturns(channel: Channel): Promise<ReturnIngestResult> {
  await connectDB();
  const adapter = getAdapter(channel);
  const cursorKey = `${channel}:returns`;
  const cursor = await SyncStateModel.findOne({ key: cursorKey }).lean();
  const returns = await adapter.pullReturns(cursor?.lastSyncAt ?? undefined);

  const res: ReturnIngestResult = { channel, pulled: returns.length, received: 0, unmapped: 0 };

  for (const r of returns) {
    const exists = await ReturnRecordModel.exists({ channel, channelReturnId: r.channelReturnId });
    if (exists) continue;

    const listing = await ChannelListingModel.findOne({ channel, channelSku: r.channelSku }).lean();
    const sku = listing?.sku;

    if (sku) {
      await applyMovement({
        sku,
        locationCode: SystemLocation.QUARANTINE,
        qty: r.qty,
        type: MovementType.RETURNED,
        refType: 'RETURN',
        refId: `${channel}:${r.channelReturnId}`,
        note: r.reason,
      });
    } else {
      res.unmapped++;
    }

    try {
      await ReturnRecordModel.create({
        channel,
        channelReturnId: r.channelReturnId,
        channelOrderId: r.channelOrderId,
        channelSku: r.channelSku,
        sku,
        qty: r.qty,
        reason: r.reason,
        status: 'RECEIVED',
        receivedAt: r.receivedAt,
      });
      res.received++;
    } catch (err: unknown) {
      if (!(err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000)) {
        throw err;
      }
    }
  }

  await SyncStateModel.updateOne({ key: cursorKey }, { $set: { lastSyncAt: new Date() } }, { upsert: true });
  return res;
}

export async function ingestAllReturns(): Promise<ReturnIngestResult[]> {
  const out: ReturnIngestResult[] = [];
  for (const channel of CHANNELS) out.push(await ingestReturns(channel));
  return out;
}

/**
 * Grade a received return: move it out of QUARANTINE to MAIN (resellable) or to the
 * DAMAGED location (write-off). Grading SELLABLE increases available stock, so the
 * SKU is re-synced to its channels.
 */
export async function gradeReturn(returnId: string, grade: 'SELLABLE' | 'DAMAGED') {
  await connectDB();
  const rec = await ReturnRecordModel.findById(returnId);
  if (!rec) throw new Error('Return not found');
  if (rec.status === 'GRADED') throw new Error('Return already graded');
  if (!rec.sku) throw new Error('Return has no mapped SKU — map the listing first');

  const dest = grade === 'SELLABLE' ? SystemLocation.MAIN : SystemLocation.DAMAGED;
  await transferStock({
    sku: rec.sku,
    fromLocation: SystemLocation.QUARANTINE,
    toLocation: dest,
    qty: rec.qty,
    refType: 'RETURN_GRADE',
    refId: String(rec._id),
    note: `Graded ${grade}`,
  });

  rec.status = 'GRADED';
  rec.grade = grade;
  rec.gradedAt = new Date();
  await rec.save();

  if (grade === 'SELLABLE') await syncSkus([rec.sku]);
  return rec.toObject();
}

export async function listReturns(status?: 'RECEIVED' | 'GRADED', limit = 100) {
  await connectDB();
  const filter = status ? { status } : {};
  return ReturnRecordModel.find(filter).sort({ receivedAt: -1 }).limit(limit).lean();
}
