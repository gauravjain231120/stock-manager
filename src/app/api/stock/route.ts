import { z } from 'zod';
import { getInventoryOverview } from '@/lib/queries';
import { setStock } from '@/lib/stock';

export const dynamic = 'force-dynamic';

/** GET /api/stock — full inventory overview (summary + per-SKU rows). */
export async function GET() {
  const overview = await getInventoryOverview();
  return Response.json(overview);
}

const SetStock = z.object({
  sku: z.string().min(1),
  onHand: z.number().int().min(0),
});

/** PATCH /api/stock — set a SKU's current stock to an exact number. */
export async function PATCH(request: Request) {
  const parsed = SetStock.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const res = await setStock(parsed.data.sku, parsed.data.onHand);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
