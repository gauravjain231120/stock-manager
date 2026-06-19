import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { RawMaterialModel } from '@/models/RawMaterial';
import { RawMaterialMovementModel, RawMovementType } from '@/models/RawMaterialMovement';
import { listRawMaterials, lowRawMaterials } from '@/lib/production';

export const dynamic = 'force-dynamic';

/** GET /api/raw-materials -> all materials + those at/below reorder point. */
export async function GET() {
  const [materials, low] = await Promise.all([listRawMaterials(), lowRawMaterials()]);
  return Response.json({ materials, low });
}

const CreateMaterial = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().optional(),
  reorderPoint: z.number().min(0).optional(),
  costPerUnit: z.number().min(0).optional(),
  openingQty: z.number().min(0).optional(),
});

/** POST /api/raw-materials -> create a material (with optional opening qty). */
export async function POST(request: Request) {
  await connectDB();
  const parsed = CreateMaterial.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const m = parsed.data;
  const code = m.code.trim().toUpperCase();
  if (await RawMaterialModel.exists({ code })) {
    return Response.json({ error: `Material ${code} already exists` }, { status: 409 });
  }

  const opening = m.openingQty ?? 0;
  await RawMaterialModel.create({
    code,
    name: m.name,
    unit: m.unit ?? 'pcs',
    reorderPoint: m.reorderPoint ?? 0,
    costPerUnit: m.costPerUnit,
    onHand: opening,
  });
  if (opening > 0) {
    await RawMaterialMovementModel.create({
      materialCode: code,
      qty: opening,
      type: RawMovementType.ADJUSTED,
      refType: 'OPENING',
      note: 'Opening balance',
    });
  }
  return Response.json({ ok: true, code }, { status: 201 });
}
