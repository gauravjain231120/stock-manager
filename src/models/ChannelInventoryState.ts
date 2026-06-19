import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { CHANNELS } from '@/lib/constants';

/**
 * What we last published to each channel for each listing — so we can detect
 * drift, avoid redundant pushes, and show "what does Amazon/Flipkart/Myntra
 * currently believe my stock is".
 */
const ChannelInventoryStateSchema = new Schema(
  {
    channel: { type: String, required: true, enum: CHANNELS },
    channelSku: { type: String, required: true },
    sku: { type: String, required: true },
    publishedQty: { type: Number, required: true, default: 0 },
    lastPushedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

ChannelInventoryStateSchema.index({ channel: 1, channelSku: 1 }, { unique: true });

export type ChannelInventoryState = InferSchemaType<typeof ChannelInventoryStateSchema>;

export const ChannelInventoryStateModel: Model<ChannelInventoryState> =
  (mongoose.models.ChannelInventoryState as Model<ChannelInventoryState>) ||
  mongoose.model<ChannelInventoryState>('ChannelInventoryState', ChannelInventoryStateSchema);
