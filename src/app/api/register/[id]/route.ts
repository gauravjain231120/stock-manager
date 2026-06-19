import { deleteEntry } from '@/lib/register';

export const dynamic = 'force-dynamic';

/** DELETE /api/register/[id] -> remove a Stock Log entry and reverse its stock effect. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deleteEntry(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
