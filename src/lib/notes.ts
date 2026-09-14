import { connectDB } from '@/lib/db';
import { NoteModel } from '@/models/Note';

export interface NoteItem {
  id: string;
  title: string;
  text: string;
  updatedAt: string;
}

function toItem(doc: { _id: unknown; title?: string | null; text?: string | null; updatedAt?: Date }): NoteItem {
  return {
    id: String(doc._id),
    title: doc.title ?? '',
    text: doc.text ?? '',
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

/** Every note, most recently edited first. */
export async function listNotes(): Promise<NoteItem[]> {
  await connectDB();
  const docs = await NoteModel.find().sort({ updatedAt: -1 }).lean();
  return docs.map(toItem);
}

/** Creates a new, empty note. */
export async function createNote(): Promise<NoteItem> {
  await connectDB();
  const doc = await NoteModel.create({ title: '', text: '' });
  return toItem(doc.toObject());
}

/** Updates a note's title and/or text. */
export async function updateNote(id: string, changes: { title?: string; text?: string }): Promise<void> {
  await connectDB();
  const set: Record<string, string> = {};
  if (changes.title !== undefined) set.title = changes.title;
  if (changes.text !== undefined) set.text = changes.text;
  if (Object.keys(set).length === 0) return;
  await NoteModel.updateOne({ _id: id }, { $set: set });
}

/** Deletes a note. */
export async function deleteNote(id: string): Promise<void> {
  await connectDB();
  await NoteModel.deleteOne({ _id: id });
}
