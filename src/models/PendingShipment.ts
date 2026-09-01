import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * An order that's been received but not yet packed/shipped — sits in the
 * "Ready to Ship" queue. Adding one RESERVES stock; shipping it deducts stock.
 */
const PendingShipmentSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true, index: true },
    qty: { type: Number, required: true, min: 1 },
    channel: { type: String, trim: true }, // platform (AMAZON / FLIPKART / MYNTRA / OWN_SITE)
    orderId: { type: String, trim: true },
    // Courier tracking / AWB, filled in as soon as the label exists — so packing
    // is just "check the number, hit Ship".
    trackingId: { type: String, trim: true, uppercase: true },
    buyer: { type: String, trim: true },
    // Packed and set aside, but not yet shipped — kept off the print sheet so it
    // isn't packed twice.
    ready: { type: Boolean, default: false },
    // When the marketplace order was actually placed (not when it was added to
    // this queue) and its ship-by deadline — both optional, set by whatever
    // integration adds the order (e.g. an order-alert bot).
    placedAt: { type: Date },
    shipByAt: { type: Date },
  },
  { timestamps: true },
);

export type PendingShipment = InferSchemaType<typeof PendingShipmentSchema>;

export const PendingShipmentModel: Model<PendingShipment> =
  (mongoose.models.PendingShipment as Model<PendingShipment>) ||
  mongoose.model<PendingShipment>('PendingShipment', PendingShipmentSchema);
