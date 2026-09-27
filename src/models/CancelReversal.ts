import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * Stock put back because a marketplace cancelled an order AFTER it was marked
 * shipped (unshipCancelledLine). Kept so a later return scan of that same order
 * — the courier bringing the parcel back as an RTO — isn't counted as a second
 * +1: assertNotAlreadyReturned treats these units as already returned.
 * `skuSuffix` = the variant part of the SKU (after the brand prefix).
 */
const CancelReversalSchema = new Schema(
  {
    orderId: { type: String, required: true },
    skuSuffix: { type: String, required: true },
    sku: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    movementIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

CancelReversalSchema.index({ orderId: 1, skuSuffix: 1 });

export type CancelReversal = InferSchemaType<typeof CancelReversalSchema>;

export const CancelReversalModel: Model<CancelReversal> =
  (mongoose.models.CancelReversal as Model<CancelReversal>) ||
  mongoose.model<CancelReversal>('CancelReversal', CancelReversalSchema);
