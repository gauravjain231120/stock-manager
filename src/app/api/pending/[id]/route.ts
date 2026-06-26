import { shipPending, cancelPending } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/** POST /api/pending/[id] -> ship some/all of this item (deduct stock, release reservation). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as { qty?: number }));
  const qty = typeof body?.qty === 'number' ? body.qty : undefined;
  try {
    const res = await shipPending(id, qty);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/pending/[id] -> cancel (release reservation, no deduction). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await cancelPending(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
