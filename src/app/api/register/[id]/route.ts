import { z } from 'zod';
import { deleteEntry, editEntry } from '@/lib/register';
import { PLATFORMS, RETURN_CONDITIONS, RETURN_TYPES } from '@/lib/constants';
import { canSetReturnType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  sku: z.string().optional(),
  qty: z.number().int().positive().optional(),
  channel: z.enum(PLATFORMS).nullable().optional(),
  date: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'That date is not valid')
    .optional(),
  trackingId: z.string().optional(),
  orderId: z.string().optional(),
  condition: z.enum(RETURN_CONDITIONS).optional(),
  returnType: z.enum(RETURN_TYPES).optional(),
});

/** PATCH /api/register/[id] -> edit a Stock Log entry (quantity / platform / date). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    await editEntry(id, {
      sku: parsed.data.sku,
      qty: parsed.data.qty,
      channel: parsed.data.channel,
      date: parsed.data.date ? new Date(parsed.data.date) : undefined,
      trackingId: parsed.data.trackingId,
      orderId: parsed.data.orderId,
      condition: parsed.data.condition,
      // Owner only — ignored for anyone else, so the stored value is kept.
      returnType: parsed.data.returnType && (await canSetReturnType()) ? parsed.data.returnType : undefined,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/register/[id] -> remove a Stock Log entry and reverse its stock effect. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const res = await deleteEntry(id);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
