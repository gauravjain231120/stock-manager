import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { PLATFORMS } from '@/lib/constants';

/**
 * One line of a marketplace return report — a tracking number the platform says
 * is coming back. `settled` marks a parcel that never arrived but has been
 * claimed/written off, so it stops showing as outstanding.
 */
const ReturnReportItemSchema = new Schema(
  {
    trackingId: { type: String, required: true, trim: true, uppercase: true },
    settled: { type: Boolean, default: false },
    note: { type: String, trim: true },
  },
  { _id: false },
);

/**
 * A return report shared by a marketplace ("Myntra says 20 parcels are coming").
 * Each tracking number is matched against the returns actually logged — on ANY
 * date, since a parcel listed today may only arrive next week — so the missing
 * ones stay visible until they turn up or are claimed.
 */
const ReturnReportSchema = new Schema(
  {
    platform: { type: String, enum: PLATFORMS },
    reportDate: { type: Date, required: true },
    items: { type: [ReturnReportItemSchema], default: [] },
  },
  { timestamps: true },
);

ReturnReportSchema.index({ reportDate: -1 });
// A tracking number belongs to exactly one report — enforced by the database, so
// no import script or code path can slip a duplicate in.
ReturnReportSchema.index({ 'items.trackingId': 1 }, { unique: true });

export type ReturnReport = InferSchemaType<typeof ReturnReportSchema>;

export const ReturnReportModel: Model<ReturnReport> =
  (mongoose.models.ReturnReport as Model<ReturnReport>) ||
  mongoose.model<ReturnReport>('ReturnReport', ReturnReportSchema);
