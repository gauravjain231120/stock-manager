import { updateNote, deleteNote } from '@/lib/notes';

export const dynamic = 'force-dynamic';

/** PATCH /api/notes/[id] -> update a note's title and/or text. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    await updateNote(id, {
      title: typeof body?.title === 'string' ? body.title : undefined,
      text: typeof body?.text === 'string' ? body.text : undefined,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/notes/[id] -> remove a note. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deleteNote(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
