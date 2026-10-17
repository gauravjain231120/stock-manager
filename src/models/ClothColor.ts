import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * Fabric / Cloth color swatches with name, photo, and optional notes.
 */
const ClothColorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

ClothColorSchema.index({ name: 1 });

export type ClothColor = InferSchemaType<typeof ClothColorSchema>;

export const ClothColorModel: Model<ClothColor> =
  (mongoose.models.ClothColor as Model<ClothColor>) ||
  mongoose.model<ClothColor>('ClothColor', ClothColorSchema);
