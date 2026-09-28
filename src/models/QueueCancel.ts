import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * One Ready-to-Ship cancel (DELETE /api/pending/[id]) made with a caller's
 * `requestId` — written in the same transaction as the queue change, so a
 * repeat of that request (its first answer was lost on the way back) is
 * answered with what it did instead of taking another unit off the queue.
 * Kept 30 days, then removed by MongoDB's TTL monitor.
 */
const QueueCancelSchema = new Schema(
  {
    requestId: { type: String, required: true },
    rowId: { type: String, required: true },
    cancelled: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

QueueCancelSchema.index({ requestId: 1 }, { unique: true });
QueueCancelSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export type QueueCancel = InferSchemaType<typeof QueueCancelSchema>;

export const QueueCancelModel: Model<QueueCancel> =
  (mongoose.models.QueueCancel as Model<QueueCancel>) || mongoose.model<QueueCancel>('QueueCancel', QueueCancelSchema);
