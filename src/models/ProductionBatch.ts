import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * A record of one manufacturing run: "made N units of SKU on this date". Creating
 * it posts a PRODUCED stock movement for the finished goods and CONSUMED movements
 * for the raw materials per the BOM — all in one transaction.
 */
const ConsumedSchema = new Schema(
  { materialCode: { type: String, required: true }, qty: { type: Number, required: true } },
  { _id: false },
);

const ProductionBatchSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    qty: { type: Number, required: true, min: 1 },
    locationCode: { type: String, required: true, trim: true, uppercase: true },
    materialsConsumed: { type: [ConsumedSchema], default: [] },
    note: { type: String, trim: true },
  },
  { timestamps: true },
);

ProductionBatchSchema.index({ sku: 1, createdAt: -1 });

export type ProductionBatch = InferSchemaType<typeof ProductionBatchSchema>;

export const ProductionBatchModel: Model<ProductionBatch> =
  (mongoose.models.ProductionBatch as Model<ProductionBatch>) ||
  mongoose.model<ProductionBatch>('ProductionBatch', ProductionBatchSchema);
