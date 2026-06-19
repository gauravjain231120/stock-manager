import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * Per-SKU replenishment settings. The reorder point is computed:
 *   reorderPoint = avgDailySales * leadTimeDays + safetyStock
 * When sellable on-hand drops to/below it, the SKU needs a production run.
 */
const ReorderPolicySchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    safetyStock: { type: Number, required: true, default: 0, min: 0 },
    leadTimeDays: { type: Number, required: true, default: 7, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ReorderPolicy = InferSchemaType<typeof ReorderPolicySchema>;

export const ReorderPolicyModel: Model<ReorderPolicy> =
  (mongoose.models.ReorderPolicy as Model<ReorderPolicy>) ||
  mongoose.model<ReorderPolicy>('ReorderPolicy', ReorderPolicySchema);
