import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * A raw material / component you stock to manufacture finished goods (fabric,
 * zips, thread, packaging...). `onHand` is the live count; the RawMaterialMovement
 * ledger is its audit trail. `reorderPoint` drives low-material alerts.
 */
const RawMaterialSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true, default: 'pcs' }, // pcs, m, kg...
    onHand: { type: Number, required: true, default: 0 },
    reorderPoint: { type: Number, required: true, default: 0, min: 0 },
    costPerUnit: { type: Number, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type RawMaterial = InferSchemaType<typeof RawMaterialSchema>;

export const RawMaterialModel: Model<RawMaterial> =
  (mongoose.models.RawMaterial as Model<RawMaterial>) ||
  mongoose.model<RawMaterial>('RawMaterial', RawMaterialSchema);
