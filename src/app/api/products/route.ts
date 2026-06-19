import { z } from 'zod';
import { createProductGroup, getProductGroups } from '@/lib/products';

export const dynamic = 'force-dynamic';

/** GET /api/products -> product groups with per-variant stock. */
export async function GET() {
  const data = await getProductGroups();
  return Response.json(data);
}

const CreateGroup = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  mrp: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  colors: z.array(z.string()).default([]),
  sizes: z.array(z.string()).default([]),
  variants: z
    .array(
      z.object({
        color: z.string().optional(),
        size: z.string().optional(),
        openingQty: z.number().int().min(0).optional(),
      }),
    )
    .min(1),
});

/** POST /api/products -> create a product + a SKU per colour×size variant. */
export async function POST(request: Request) {
  const parsed = CreateGroup.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const res = await createProductGroup(parsed.data);
    return Response.json({ ok: true, ...res }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
