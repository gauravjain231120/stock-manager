import { z } from 'zod';
import { listClothPurchases, addClothPurchase } from '@/lib/clothPurchases';

export const dynamic = 'force-dynamic';

/** GET /api/account/cloth -> every cloth purchase, most recent first. */
export async function GET() {
  const items = await listClothPurchases();
  return Response.json({ items });
}

const AddPurchase = z.object({
  category: z.string().trim().max(200).optional(),
  name: z.string().trim().min(1).max(200),
  meters: z.number().positive(),
  price: z.number().positive(),
  shop: z.string().trim().max(200).optional(),
  date: z.string().min(1),
});

/** POST /api/account/cloth -> log a new cloth purchase. */
export async function POST(req: Request) {
  const parsed = AddPurchase.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const item = await addClothPurchase({ ...parsed.data, category: parsed.data.category ?? '', shop: parsed.data.shop ?? '' });
  return Response.json({ item });
}
