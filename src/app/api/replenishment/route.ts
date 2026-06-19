import { z } from 'zod';
import { replenishmentSuggestions, setReorderPolicy } from '@/lib/replenishment';

export const dynamic = 'force-dynamic';

/** GET /api/replenishment -> reorder suggestions across all SKUs. */
export async function GET() {
  const rows = await replenishmentSuggestions(30);
  return Response.json({ rows, needingReorder: rows.filter((r) => r.needsReorder).length });
}

const Policy = z.object({
  sku: z.string().min(1),
  safetyStock: z.number().int().min(0),
  leadTimeDays: z.number().int().min(0),
});

/** POST /api/replenishment -> set a SKU's reorder policy (safety stock, lead time). */
export async function POST(request: Request) {
  const parsed = Policy.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  await setReorderPolicy(parsed.data.sku, parsed.data.safetyStock, parsed.data.leadTimeDays);
  return Response.json({ ok: true });
}
