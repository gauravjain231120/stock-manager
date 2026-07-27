import { receiveReturn, deleteExpectedReturn, ReturnCondition } from '@/lib/returnShipments';

export const dynamic = 'force-dynamic';

const CONDITIONS: ReturnCondition[] = ['GOOD', 'BAD', 'WRONG'];

/** POST /api/return-shipments/[id] { condition, note } -> mark the parcel received. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const condition = body?.condition as ReturnCondition;
  if (!CONDITIONS.includes(condition)) {
    return Response.json({ error: 'Pick Good, Bad or Wrong' }, { status: 400 });
  }
  try {
    const res = await receiveReturn(id, condition, typeof body?.note === 'string' ? body.note : undefined);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/return-shipments/[id] -> remove an expected return added by mistake. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return Response.json(await deleteExpectedReturn(id));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
