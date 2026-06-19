import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { CHANNELS } from '@/lib/constants';

/**
 * A returned unit (or units). Flow:
 *   RECEIVED  -> landed in QUARANTINE (a RETURNED movement was posted)
 *   GRADED    -> inspected; grade SELLABLE (moved back to MAIN) or DAMAGED
 *               (moved to the DAMAGED location)
 *
 * Unique on (channel, channelReturnId) so re-pulling a return is a no-op.
 */
const ReturnRecordSchema = new Schema(
  {
    channel: { type: String, required: true, enum: CHANNELS },
    channelReturnId: { type: String, required: true },
    channelOrderId: { type: String },
    channelSku: { type: String, required: true },
    sku: { type: String }, // internal sku (null if unmapped)
    qty: { type: Number, required: true, min: 1 },
    reason: { type: String },
    status: { type: String, enum: ['RECEIVED', 'GRADED'], default: 'RECEIVED' },
    grade: { type: String, enum: ['SELLABLE', 'DAMAGED', null], default: null },
    receivedAt: { type: Date, required: true },
    gradedAt: { type: Date },
  },
  { timestamps: true },
);

ReturnRecordSchema.index({ channel: 1, channelReturnId: 1 }, { unique: true });
ReturnRecordSchema.index({ status: 1, receivedAt: -1 });

export type ReturnRecord = InferSchemaType<typeof ReturnRecordSchema>;

export const ReturnRecordModel: Model<ReturnRecord> =
  (mongoose.models.ReturnRecord as Model<ReturnRecord>) ||
  mongoose.model<ReturnRecord>('ReturnRecord', ReturnRecordSchema);
