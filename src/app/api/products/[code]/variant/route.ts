import { z } from 'zod';
import {
  addVariant,
  addVariantsForColor,
  removeVariant,
  renameVariantSku,
  editVariantAttributes,
  setSharesStockWith,
  setSharesStockWithForColorGroup,
} from '@/lib/products';

export const dynamic = 'force-dynamic';

const AddVariant = z.object({
  color: z.string().optional(),
  size: z.string().optional(),
  openingQty: z.number().int().min(0).optional(),
  sku: z.string().optional(),
  // Extra sizes to auto-create alongside this one, swapping the size segment
  // of `sku` for each — one SKU typed in fills the whole size run.
  extraSizes: z.array(z.string()).optional(),
});

// All fields but `sku` are optional — send only what you're changing.
// `sharesStockWith: null` clears it back to "own stock"; omit it to leave alone.
const EditVariant = z.object({
  sku: z.string().min(1),
  newSku: z.string().min(1).optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  sharesStockWith: z.string().nullable().optional(),
  // Apply the same sharesStockWith (size-swapped) to every other size of this
  // variant's colour, instead of just this one SKU.
  applyToColorGroup: z.boolean().optional(),
});

/** PATCH /api/products/[code]/variant -> rename a SKU and/or edit its colour, size, or stock-sharing. */
export async function PATCH(req: Request) {
  const parsed = EditVariant.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Provide sku' }, { status: 400 });
  }
  const { sku, newSku, color, size, sharesStockWith, applyToColorGroup } = parsed.data;
  try {
    let current = sku;
    let result: Record<string, unknown> = { sku };
    if (newSku && newSku.trim().toUpperCase() !== current.trim().toUpperCase()) {
      const res = await renameVariantSku(current, newSku);
      current = res.sku;
      result = { ...result, ...res };
    }
    if (color !== undefined || size !== undefined) {
      const res = await editVariantAttributes(current, { color, size });
      result = { ...result, ...res };
    }
    if (sharesStockWith !== undefined) {
      const res =
        sharesStockWith && applyToColorGroup
          ? await setSharesStockWithForColorGroup(current, sharesStockWith)
          : await setSharesStockWith(current, sharesStockWith);
      result = { ...result, ...res };
    }
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** POST /api/products/[code]/variant -> add a colour/size variant SKU (optionally filling in more sizes at once). */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const parsed = AddVariant.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.color && !parsed.data.size)) {
    return Response.json({ error: 'Provide a colour and/or size' }, { status: 400 });
  }
  try {
    if (parsed.data.extraSizes?.length) {
      if (!parsed.data.sku) return Response.json({ error: 'A SKU is required to fill in the other sizes' }, { status: 400 });
      const res = await addVariantsForColor(code, {
        color: parsed.data.color,
        size: parsed.data.size,
        sku: parsed.data.sku,
        openingQty: parsed.data.openingQty,
        extraSizes: parsed.data.extraSizes,
      });
      return Response.json({ ok: true, ...res }, { status: 201 });
    }
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
