import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { MOVEMENT_TYPES } from '@/lib/constants';

/**
 * The immutable ledger — the heart of the whole system. Every change to stock is
 * one append-only row. NEVER update or delete a row; to correct a mistake, post
 * a compensating ADJUSTED movement. Current on-hand for a (sku, location) is just
 * the running sum of `qty` here, which makes the cache (SkuStock) auditable and
 * answers made/sold/returned for free.
 *
 * `qty` is a SIGNED delta to on-hand (e.g. +100 PRODUCED, -1 SOLD).
 */
const StockMovementSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    locationCode: { type: String, required: true, trim: true, uppercase: true },
    qty: { type: Number, required: true },
    type: { type: String, required: true, enum: MOVEMENT_TYPES },
    // Platform for Stock Log Ship/Return entries: AMAZON / FLIPKART / MYNTRA / OWN_SITE.
    channel: { type: String, trim: true },
    // Optional link to the thing that caused this (order id, production batch id,
    // return id, import batch, etc.) for traceability.
    refType: { type: String, trim: true },
    refId: { type: String, trim: true },
    note: { type: String, trim: true },
    // Courier tracking / AWB scanned when the parcel was packed, and the
    // marketplace order number — both carried over from the ship queue.
    trackingId: { type: String, trim: true, uppercase: true },
    orderId: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Fast "current stock" and per-type reporting per sku/location/time.
StockMovementSchema.index({ sku: 1, locationCode: 1, createdAt: 1 });
StockMovementSchema.index({ type: 1, createdAt: 1 });

export type StockMovement = InferSchemaType<typeof StockMovementSchema>;

export const StockMovementModel: Model<StockMovement> =
  (mongoose.models.StockMovement as Model<StockMovement>) ||
  mongoose.model<StockMovement>('StockMovement', StockMovementSchema);
