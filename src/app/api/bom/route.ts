import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { BomModel } from '@/models/Bom';

export const dynamic = 'force-dynamic';

/** GET /api/bom            -> all BOMs
 *  GET /api/bom?sku=XYZ    -> one BOM */
export async function GET(request: Request) {
  await connectDB();
  const sku = new URL(request.url).searchParams.get('sku');
  if (sku) {
    const bom = await BomModel.findOne({ sku: sku.toUpperCase() }).lean();
    return Response.json({ bom });
  }
  const boms = await BomModel.find().sort({ sku: 1 }).lean();
  return Response.json({ boms });
}

const PutBom = z.object({
  sku: z.string().min(1),
  components: z
    .array(z.object({ materialCode: z.string().min(1), qtyPerUnit: z.number().min(0) }))
    .default([]),
});

/** PUT /api/bom -> upsert the bill of materials for a SKU. */
export async function PUT(request: Request) {
  await connectDB();
  const parsed = PutBom.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const sku = parsed.data.sku.trim().toUpperCase();
  const components = parsed.data.components.map((c) => ({
    materialCode: c.materialCode.trim().toUpperCase(),
    qtyPerUnit: c.qtyPerUnit,
  }));
  await BomModel.updateOne({ sku }, { $set: { components } }, { upsert: true });
  return Response.json({ ok: true, sku });
}
