import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * A physical (or logical) place stock can sit: your main warehouse, a returns
 * quarantine area, a damaged/write-off bin, etc. Stock is always tracked per
 * (sku, location), so returns and damages never pollute your sellable count.
 */
const LocationSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    // SELLABLE stock counts toward what we publish to channels; QUARANTINE and
    // DAMAGED do not.
    kind: {
      type: String,
      enum: ['SELLABLE', 'QUARANTINE', 'DAMAGED'],
      default: 'SELLABLE',
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type Location = InferSchemaType<typeof LocationSchema>;

export const LocationModel: Model<Location> =
  (mongoose.models.Location as Model<Location>) ||
  mongoose.model<Location>('Location', LocationSchema);
