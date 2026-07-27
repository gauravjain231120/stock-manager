import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { PLATFORMS } from '@/lib/constants';

/**
 * A return parcel on its way back to you. Flow:
 *   EXPECTED  -> customer initiated the return; you have the tracking/AWB number
 *   RECEIVED  -> parcel arrived (scanned) and you graded what was inside:
 *                GOOD  back into sellable stock
 *                BAD   damaged — parked in the DAMAGED location, never sold
 *                WRONG not the item you sent — no stock added, claim it back
 *
 * Unique on trackingId so scanning the same parcel twice can't double-count it.
 */
const ReturnShipmentSchema = new Schema(
  {
    trackingId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    channel: { type: String, enum: PLATFORMS },
    orderId: { type: String, trim: true },
    qty: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: ['EXPECTED', 'RECEIVED'], default: 'EXPECTED' },
    condition: { type: String, enum: ['GOOD', 'BAD', 'WRONG', null], default: null },
    note: { type: String, trim: true },
    initiatedAt: { type: Date, required: true, default: () => new Date() },
    receivedAt: { type: Date },
  },
  { timestamps: true },
);

ReturnShipmentSchema.index({ status: 1, initiatedAt: -1 });

export type ReturnShipment = InferSchemaType<typeof ReturnShipmentSchema>;

export const ReturnShipmentModel: Model<ReturnShipment> =
  (mongoose.models.ReturnShipment as Model<ReturnShipment>) ||
  mongoose.model<ReturnShipment>('ReturnShipment', ReturnShipmentSchema);
