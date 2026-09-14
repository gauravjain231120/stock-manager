import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * One expense/income cycle, typically 15-30 days — closed by hand whenever the
 * owner is done with it, never on a fixed timer. Exactly one is ever OPEN;
 * closing it creates the next one automatically.
 */
const AccountPeriodSchema = new Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', index: true },
  },
  { timestamps: true },
);

export type AccountPeriod = InferSchemaType<typeof AccountPeriodSchema>;

export const AccountPeriodModel: Model<AccountPeriod> =
  (mongoose.models.AccountPeriod as Model<AccountPeriod>) ||
  mongoose.model<AccountPeriod>('AccountPeriod', AccountPeriodSchema);
