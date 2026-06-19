import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * Product / SKU master. The internal `sku` is the single source of truth — one
 * per real product/variant (e.g. one per size+colour for apparel). Marketplace
 * listings map back to this via ChannelListing.
 */
const ProductSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    // Links a size/colour variant back to its parent product (ProductGroup.code).
    groupCode: { type: String, trim: true, uppercase: true, index: true },
    // Product photo (variants inherit the group's image unless overridden).
    imageUrl: { type: String, trim: true },
    // Free-form variant attributes, e.g. { size: 'M', color: 'Blue' }.
    attributes: { type: Map, of: String, default: {} },
    category: { type: String, trim: true },
    // Costing / pricing reference (in your base currency, e.g. INR).
    costPrice: { type: Number, min: 0 },
    mrp: { type: Number, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type Product = InferSchemaType<typeof ProductSchema>;

export const ProductModel: Model<Product> =
  (mongoose.models.Product as Model<Product>) || mongoose.model<Product>('Product', ProductSchema);
