import mongoose, { Schema, Model } from "mongoose";

export interface SettingDoc {
  _id: string;
  value: any;
  updatedAt?: Date;
  updatedBy?: string;
}

const SettingSchema = new Schema(
  {
    _id: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

export const SettingModel: Model<SettingDoc> =
  (mongoose.models.Setting as Model<SettingDoc>) ||
  mongoose.model<SettingDoc>("Setting", SettingSchema, "settings");
