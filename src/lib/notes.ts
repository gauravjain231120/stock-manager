import { connectDB } from '@/lib/db';
import { NoteModel } from '@/models/Note';

const NOTE_ID = 'main';

export async function getNote(): Promise<string> {
  await connectDB();
  const doc = await NoteModel.findById(NOTE_ID).lean();
  return doc?.text ?? '';
}

export async function saveNote(text: string): Promise<void> {
  await connectDB();
  await NoteModel.updateOne({ _id: NOTE_ID }, { $set: { text } }, { upsert: true });
}
