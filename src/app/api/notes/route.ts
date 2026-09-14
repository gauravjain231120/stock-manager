import { listNotes, createNote } from '@/lib/notes';

export const dynamic = 'force-dynamic';

/** GET /api/notes -> every note, most recently edited first. */
export async function GET() {
  const notes = await listNotes();
  return Response.json({ notes });
}

/** POST /api/notes -> create a new, empty note. */
export async function POST() {
  const note = await createNote();
  return Response.json({ note });
}
