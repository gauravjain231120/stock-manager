import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

/** One free-text note in the notes list — title is optional, just for telling them apart. */
const NoteSchema = new Schema(
  {
    title: { type: String, default: '', trim: true },
    text: { type: String, default: '' },
  },
  { timestamps: true },
);

export type Note = InferSchemaType<typeof NoteSchema>;

export const NoteModel: Model<Note> =
  (mongoose.models.Note as Model<Note>) || mongoose.model<Note>('Note', NoteSchema);
