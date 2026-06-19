import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * A parent product / "style" (e.g. "Round Neck T-Shirt") that has many variants.
 * Each colour×size combination becomes its own Product (SKU) so stock is tracked
 * per variant, while the group holds the shared name, photo, category and price.
 *
 *   code   the SKU prefix, e.g. TSHIRT  ->  variant SKUs like TSHIRT-BLACK-M
 */
const ProductGroupSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    mrp: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0 },
    colors: { type: [String], default: [] },
    sizes: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ProductGroup = InferSchemaType<typeof ProductGroupSchema>;

export const ProductGroupModel: Model<ProductGroup> =
  (mongoose.models.ProductGroup as Model<ProductGroup>) ||
  mongoose.model<ProductGroup>('ProductGroup', ProductGroupSchema);
