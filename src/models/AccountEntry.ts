import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * One expense or receipt line, belonging to an AccountPeriod. Editable and
 * deletable regardless of whether its period is still open — closing a
 * period only stops NEW entries landing in it, it doesn't lock the old ones,
 * so a typo can always be fixed later.
 */
const AccountEntrySchema = new Schema(
  {
    periodId: { type: String, required: true, index: true },
    type: { type: String, enum: ['EXPENSE', 'RECEIVED'], required: true },
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

export type AccountEntry = InferSchemaType<typeof AccountEntrySchema>;

export const AccountEntryModel: Model<AccountEntry> =
  (mongoose.models.AccountEntry as Model<AccountEntry>) ||
  mongoose.model<AccountEntry>('AccountEntry', AccountEntrySchema);
