import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * Live stock cache: one document per (sku, location). This is a fast, always-
 * consistent projection of the ledger, kept correct by atomic writes inside the
 * same transaction that appends each StockMovement.
 *
 *   onHand    physical units present at this location
 *   reserved  units committed to unshipped orders (not yet sold)
 *   buffer    safety units withheld from channels to absorb sync lag
 *
 *   available (derived) = onHand - reserved
 *   publishable to a channel = max(0, available - buffer)
 *
 * The atomic guard `(onHand - reserved) >= qty` on findOneAndUpdate is what makes
 * two simultaneous orders unable to both grab the last unit (anti-oversell).
 */
const SkuStockSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    locationCode: { type: String, required: true, trim: true, uppercase: true },
    onHand: { type: Number, required: true, default: 0 },
    reserved: { type: Number, required: true, default: 0, min: 0 },
    buffer: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

SkuStockSchema.index({ sku: 1, locationCode: 1 }, { unique: true });

// Convenience virtual (not used in atomic guards — those use $expr in queries).
SkuStockSchema.virtual('available').get(function (this: { onHand: number; reserved: number }) {
  return this.onHand - this.reserved;
});

export type SkuStock = InferSchemaType<typeof SkuStockSchema>;

export const SkuStockModel: Model<SkuStock> =
  (mongoose.models.SkuStock as Model<SkuStock>) ||
  mongoose.model<SkuStock>('SkuStock', SkuStockSchema);
