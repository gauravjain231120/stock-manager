import { z } from 'zod';
import { updateClothPurchase, deleteClothPurchase } from '@/lib/clothPurchases';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  category: z.string().trim().max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  meters: z.number().positive().optional(),
  price: z.number().positive().optional(),
  shop: z.string().trim().max(200).optional(),
  date: z.string().min(1).optional(),
});

/** PATCH /api/account/cloth/[id] -> edit a cloth purchase's fields. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  await updateClothPurchase(id, parsed.data);
  return Response.json({ ok: true });
}

/** DELETE /api/account/cloth/[id] -> remove a cloth purchase. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteClothPurchase(id);
  return Response.json({ ok: true });
}
