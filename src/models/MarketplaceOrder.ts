import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { CHANNELS } from '@/lib/constants';

/**
 * An order pulled from a marketplace, normalized. Each line is resolved to an
 * internal SKU and (when stock allows) posts a SOLD movement. Unique on
 * (channel, channelOrderId) so re-pulling the same order is a no-op.
 *
 * status:
 *   FULFILLED   every line had stock and was sold
 *   NEEDS_STOCK at least one line couldn't be fulfilled from on-hand (oversold)
 */
const OrderLineSchema = new Schema(
  {
    channelSku: { type: String, required: true },
    sku: { type: String }, // internal sku, null if unmapped
    qty: { type: Number, required: true },
    price: { type: Number },
    fulfilled: { type: Boolean, default: false },
    issue: { type: String }, // 'UNMAPPED' | 'INSUFFICIENT_STOCK'
  },
  { _id: false },
);

const MarketplaceOrderSchema = new Schema(
  {
    channel: { type: String, required: true, enum: CHANNELS },
    channelOrderId: { type: String, required: true },
    placedAt: { type: Date, required: true },
    status: { type: String, enum: ['FULFILLED', 'NEEDS_STOCK'], default: 'FULFILLED' },
    lines: { type: [OrderLineSchema], default: [] },
  },
  { timestamps: true },
);

MarketplaceOrderSchema.index({ channel: 1, channelOrderId: 1 }, { unique: true });
MarketplaceOrderSchema.index({ placedAt: -1 });

export type MarketplaceOrder = InferSchemaType<typeof MarketplaceOrderSchema>;

export const MarketplaceOrderModel: Model<MarketplaceOrder> =
  (mongoose.models.MarketplaceOrder as Model<MarketplaceOrder>) ||
  mongoose.model<MarketplaceOrder>('MarketplaceOrder', MarketplaceOrderSchema);
