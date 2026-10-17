import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/**
 * Stores uploaded image blobs persistently in MongoDB when external blob storage
 * (like Vercel Blob) is not configured, or as a reliable fallback.
 */
const UploadedImageSchema = new Schema(
  {
    filename: { type: String, required: true },
    contentType: { type: String, required: true, default: 'image/jpeg' },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

export type UploadedImage = InferSchemaType<typeof UploadedImageSchema>;

export const UploadedImageModel: Model<UploadedImage> =
  (mongoose.models.UploadedImage as Model<UploadedImage>) ||
  mongoose.model<UploadedImage>('UploadedImage', UploadedImageSchema);
