import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { applyMovement } from '@/lib/stock';
import { MovementType, SystemLocation } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/** GET /api/skus — list all products. */
export async function GET() {
  await connectDB();
  const products = await ProductModel.find().sort({ sku: 1 }).lean();
  return Response.json({ products });
}

const CreateSku = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  costPrice: z.number().min(0).optional(),
  mrp: z.number().min(0).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  // Optional opening physical count -> posted as an ADJUSTED opening balance.
  openingQty: z.number().int().min(0).optional(),
  locationCode: z.string().optional(),
});

/** POST /api/skus — create a SKU, optionally with an opening stock count. */
export async function POST(request: Request) {
  await connectDB();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSku.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;
  const sku = input.sku.trim().toUpperCase();

  const existing = await ProductModel.findOne({ sku }).lean();
  if (existing) {
    return Response.json({ error: `SKU ${sku} already exists` }, { status: 409 });
  }

  await ProductModel.create({
    sku,
    name: input.name,
    category: input.category,
    costPrice: input.costPrice,
    mrp: input.mrp,
    attributes: input.attributes ?? {},
  });

  if (input.openingQty && input.openingQty > 0) {
    await applyMovement({
      sku,
      locationCode: (input.locationCode ?? SystemLocation.MAIN).toUpperCase(),
      qty: input.openingQty,
      type: MovementType.ADJUSTED,
      refType: 'MANUAL',
      refId: `OPENING:${sku}`,
      note: 'Opening balance (created via API)',
    });
  }

  return Response.json({ ok: true, sku }, { status: 201 });
}
