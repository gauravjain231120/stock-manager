import { z } from 'zod';
import { addAliasSku, removeAliasSku, addAliasSkusForGroup } from '@/lib/products';

export const dynamic = 'force-dynamic';

const AddAlias = z.object({
  primarySku: z.string().min(1),
  aliasSku: z.string().min(1),
});

const BulkAddAlias = z.object({
  /** SKU prefix to replace in the primary SKU to get the alias.
   *  E.g. for RRC-001-CO-C-RED-L -> RRC-001-CO-B-RED-L, set
   *  replaceSegment: "C", withSegment: "B" (swaps the segment after CO-). */
  replaceSegment: z.string().min(1),
  withSegment: z.string().min(1),
  /** Which part position (0-based) in the SKU to swap.  Defaults to scanning. */
  segmentIndex: z.number().int().min(0).optional(),
});

/** POST /api/products/[code]/alias -> add a single alias SKU to a primary variant. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = await req.json().catch(() => null);

  // If replaceSegment is present, it's a bulk add
  const bulkParsed = BulkAddAlias.safeParse(body);
  if (bulkParsed.success) {
    const { replaceSegment, withSegment } = bulkParsed.data;
    const from = replaceSegment.toUpperCase();
    const to = withSegment.toUpperCase();
    try {
      const res = await addAliasSkusForGroup(code, (_groupCode, _color, _size, primarySku) => {
        // Split the primary SKU into segments, find the one that matches
        // `replaceSegment` and swap it with `withSegment`.
        const parts = primarySku.split('-');
        const idx = parts.indexOf(from);
        if (idx === -1) return primarySku; // no match, skip
        const newParts = [...parts];
        newParts[idx] = to;
        return newParts.join('-');
      });
      return Response.json({ ok: true, ...res }, { status: 201 });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
    }
  }

  // Single alias add
  const parsed = AddAlias.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Provide primarySku and aliasSku' }, { status: 400 });
  }
  try {
    const res = await addAliasSku(code, parsed.data.primarySku, parsed.data.aliasSku);
    return Response.json({ ok: true, ...res }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/products/[code]/alias?sku=XYZ -> remove an alias SKU. */
export async function DELETE(req: Request) {
  const sku = new URL(req.url).searchParams.get('sku');
  if (!sku) return Response.json({ error: 'Missing sku' }, { status: 400 });
  try {
    const res = await removeAliasSku(sku);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

