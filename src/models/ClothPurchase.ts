import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * One fabric purchase record — category/name/meters/price/shop/date. A
 * permanent running log, independent of the Account expense cycles (not
 * linked to their totals and never archived away when a cycle closes).
 * Category and name aren't a separate catalog — the add form offers whatever
 * has been typed before, scoped by category, so the list grows organically.
 */
const ClothPurchaseSchema = new Schema(
  {
    category: { type: String, default: '', trim: true },
    name: { type: String, required: true, trim: true },
    meters: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    shop: { type: String, default: '', trim: true },
    date: { type: Date, required: true },
  },
  { timestamps: true },
);

export type ClothPurchase = InferSchemaType<typeof ClothPurchaseSchema>;

export const ClothPurchaseModel: Model<ClothPurchase> =
  (mongoose.models.ClothPurchase as Model<ClothPurchase>) ||
  mongoose.model<ClothPurchase>('ClothPurchase', ClothPurchaseSchema);
