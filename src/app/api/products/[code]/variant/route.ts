import { z } from 'zod';
import { addVariant, removeVariant } from '@/lib/products';

export const dynamic = 'force-dynamic';

const AddVariant = z.object({
  color: z.string().optional(),
  size: z.string().optional(),
  openingQty: z.number().int().min(0).optional(),
});

/** POST /api/products/[code]/variant -> add a colour/size variant SKU. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const parsed = AddVariant.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.color && !parsed.data.size)) {
    return Response.json({ error: 'Provide a colour and/or size' }, { status: 400 });
  }
  try {
    const res = await addVariant(code, parsed.data);
    return Response.json({ ok: true, ...res }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/products/[code]/variant?sku=XYZ -> remove one variant SKU. */
export async function DELETE(req: Request) {
  const sku = new URL(req.url).searchParams.get('sku');
  if (!sku) return Response.json({ error: 'Missing sku' }, { status: 400 });
  try {
    const res = await removeVariant(sku);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
