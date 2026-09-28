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
    // Other numbers the same order goes by — Myntra returns are logged with the
    // item's portalOrderReleaseId (e.g. 100333710323), not the M-Direct order id
    // the cancellation used (e.g. 6017668763); verified on 5/5 real returns.
    altOrderIds: { type: [String], default: [] },
    skuSuffix: { type: String, required: true },
    sku: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    movementIds: { type: [String], default: [] },
    // The order-alert app's id for the request that made it (a retried
    // request is answered from these instead of reversing more).
    requestId: { type: String },
  },
  { timestamps: true },
);

CancelReversalSchema.index({ orderId: 1, skuSuffix: 1 });
CancelReversalSchema.index({ altOrderIds: 1, skuSuffix: 1 });
CancelReversalSchema.index({ requestId: 1 }, { sparse: true });

export type CancelReversal = InferSchemaType<typeof CancelReversalSchema>;

export const CancelReversalModel: Model<CancelReversal> =
  (mongoose.models.CancelReversal as Model<CancelReversal>) ||
  mongoose.model<CancelReversal>('CancelReversal', CancelReversalSchema);
