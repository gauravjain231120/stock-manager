import { moveShippedToQueue } from '@/lib/register';

export const dynamic = 'force-dynamic';

/** POST /api/register/[id]/move-to-queue -> undo a mistaken Ship: back on Ready to Ship, stock un-deducted. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return Response.json(await moveShippedToQueue(id));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
