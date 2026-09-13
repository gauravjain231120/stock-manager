import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/** A single free-text scratchpad — one document, just whatever's currently typed in it. */
const NoteSchema = new Schema(
  {
    _id: { type: String },
    text: { type: String, default: '' },
  },
  { timestamps: true },
);

export type Note = InferSchemaType<typeof NoteSchema>;

export const NoteModel: Model<Note> =
  (mongoose.models.Note as Model<Note>) || mongoose.model<Note>('Note', NoteSchema);
