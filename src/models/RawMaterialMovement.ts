import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/** Append-only ledger for raw materials (mirrors StockMovement, for inputs). */
export const RawMovementType = {
  PURCHASED: 'PURCHASED', // received from supplier (+)
  CONSUMED: 'CONSUMED', //   used by a production batch (-)
  ADJUSTED: 'ADJUSTED', //   opening balance / correction (±)
} as const;
export type RawMovementType = (typeof RawMovementType)[keyof typeof RawMovementType];

const RawMaterialMovementSchema = new Schema(
  {
    materialCode: { type: String, required: true, trim: true, uppercase: true },
    qty: { type: Number, required: true }, // signed delta
    type: { type: String, required: true, enum: Object.values(RawMovementType) },
    refType: { type: String, trim: true },
    refId: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

RawMaterialMovementSchema.index({ materialCode: 1, createdAt: 1 });

export type RawMaterialMovement = InferSchemaType<typeof RawMaterialMovementSchema>;

export const RawMaterialMovementModel: Model<RawMaterialMovement> =
  (mongoose.models.RawMaterialMovement as Model<RawMaterialMovement>) ||
  mongoose.model<RawMaterialMovement>('RawMaterialMovement', RawMaterialMovementSchema);
