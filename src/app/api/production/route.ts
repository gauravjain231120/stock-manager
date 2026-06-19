import { z } from 'zod';
import { createProductionBatch, listProductionBatches, InsufficientMaterialError } from '@/lib/production';

export const dynamic = 'force-dynamic';

/** GET /api/production -> recent production batches. */
export async function GET() {
  const batches = await listProductionBatches(50);
  return Response.json({ batches });
}

const CreateBatch = z.object({
  sku: z.string().min(1),
  qty: z.number().int().positive(),
  locationCode: z.string().optional(),
  note: z.string().optional(),
});

/** POST /api/production -> record a production run (consumes BOM materials). */
export async function POST(request: Request) {
  const parsed = CreateBatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const id = await createProductionBatch(parsed.data);
    return Response.json({ ok: true, batchId: String(id) }, { status: 201 });
  } catch (err) {
    const status = err instanceof InsufficientMaterialError ? 409 : 400;
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
