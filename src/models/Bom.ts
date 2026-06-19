import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * Bill of materials: what one unit of a finished SKU is made of. A production
 * batch multiplies each component's `qtyPerUnit` by the batch size to compute how
 * much raw material to consume.
 */
const BomComponentSchema = new Schema(
  {
    materialCode: { type: String, required: true, trim: true, uppercase: true },
    qtyPerUnit: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const BomSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    components: { type: [BomComponentSchema], default: [] },
  },
  { timestamps: true },
);

export type Bom = InferSchemaType<typeof BomSchema>;

export const BomModel: Model<Bom> =
  (mongoose.models.Bom as Model<Bom>) || mongoose.model<Bom>('Bom', BomSchema);
