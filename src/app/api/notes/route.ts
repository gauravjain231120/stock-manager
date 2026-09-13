import { z } from 'zod';
import { getNote, saveNote } from '@/lib/notes';

export const dynamic = 'force-dynamic';

/** GET /api/notes -> the current scratchpad text. */
export async function GET() {
  const text = await getNote();
  return Response.json({ text });
}

const Patch = z.object({ text: z.string().max(20000) });

/** PATCH /api/notes -> replace the scratchpad text. */
export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  await saveNote(parsed.data.text);
  return Response.json({ ok: true });
}
