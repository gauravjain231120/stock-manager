import { z } from 'zod';
import { deleteProductGroup, updateProductGroup } from '@/lib/products';

export const dynamic = 'force-dynamic';

// Deleting a product requires the password (same as login). Overridable in prod.
const DELETE_PASSWORD = process.env.AUTH_PASSWORD ?? 'rangrooh@123';

const Patch = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  mrp: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  imageUrl: z.string().optional(),
});

/** PATCH /api/products/[code] -> edit a product's name/category/price/photo. */
export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const res = await updateProductGroup(code, parsed.data);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/products/[code] -> delete a product and all its variant SKUs/stock.
 *  Requires the correct password in the body. */
export async function DELETE(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = await req.json().catch(() => ({} as { password?: string }));
  if (body?.password !== DELETE_PASSWORD) {
    return Response.json({ error: 'Wrong password — product not deleted.' }, { status: 403 });
  }
  try {
    const res = await deleteProductGroup(code);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
