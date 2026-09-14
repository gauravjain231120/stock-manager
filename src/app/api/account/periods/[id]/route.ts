import { deletePeriod } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

/** DELETE /api/account/periods/[id] -> permanently remove a closed period and its entries. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deletePeriod(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
