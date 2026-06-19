import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { CHANNELS } from '@/lib/constants';

/**
 * Maps one internal SKU to its listing on a marketplace. This is the heart of
 * multichannel: one `sku` can have up to three rows (Amazon, Flipkart, Myntra),
 * each with the channel's own id and price. Order ingestion and stock-push both
 * resolve through here.
 */
const ChannelListingSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    channel: { type: String, required: true, enum: CHANNELS },
    // The SKU/seller-code as the marketplace knows it.
    channelSku: { type: String, required: true, trim: true },
    // The marketplace's own listing identifier (Amazon ASIN, Flipkart FSN, Myntra style id).
    listingId: { type: String, trim: true },
    price: { type: Number, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// One listing per (channel, channelSku) and one per (sku, channel).
ChannelListingSchema.index({ channel: 1, channelSku: 1 }, { unique: true });
ChannelListingSchema.index({ sku: 1, channel: 1 }, { unique: true });

export type ChannelListing = InferSchemaType<typeof ChannelListingSchema>;

export const ChannelListingModel: Model<ChannelListing> =
  (mongoose.models.ChannelListing as Model<ChannelListing>) ||
  mongoose.model<ChannelListing>('ChannelListing', ChannelListingSchema);
