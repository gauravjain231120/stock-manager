import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * Tracks the last-synced cursor per (channel, kind) so each poll only pulls new
 * data. e.g. key "AMAZON:orders" -> lastSyncAt.
 */
const SyncStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    lastSyncAt: { type: Date },
  },
  { timestamps: true },
);

export type SyncState = InferSchemaType<typeof SyncStateSchema>;

export const SyncStateModel: Model<SyncState> =
  (mongoose.models.SyncState as Model<SyncState>) ||
  mongoose.model<SyncState>('SyncState', SyncStateSchema);
