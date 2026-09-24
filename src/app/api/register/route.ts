import { z } from 'zod';
import { recordEntry, REGISTER_ACTIONS, RegisterAction, DuplicateReturnError } from '@/lib/register';
import { InsufficientStockError } from '@/lib/stock';
import { PLATFORMS, RETURN_CONDITIONS, RETURN_TYPES } from '@/lib/constants';
import { canSetReturnType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    sku: z.string().min(1),
    action: z.enum(REGISTER_ACTIONS as [string, ...string[]]),
    qty: z.number().int().positive(),
    channel: z.enum(PLATFORMS).optional(),
    date: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'That date is not valid')
      .optional(),
    trackingId: z.string().optional(),
    condition: z.enum(RETURN_CONDITIONS).optional(),
    returnType: z.enum(RETURN_TYPES).optional(),
    orderId: z.string().trim().max(64).optional(),
    // Returns only: log it even if this tracking + product is already logged.
    allowDuplicate: z.boolean().optional(),
    // Returns only: how many units of this product the parcel holds.
    expectedUnits: z.number().int().positive().max(100).optional(),
  })
  .refine((d) => d.action === 'PRODUCE' || !!d.channel, {
    message: 'Please choose a platform for Ship / Return',
    path: ['channel'],
  });

/** POST /api/register -> record a Produce / Ship / Return entry (with platform + date). */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const date = parsed.data.date ? new Date(parsed.data.date) : undefined;
    // Owner / bot only — anyone else's return is stored as UNKNOWN.
    const returnType = parsed.data.returnType && (await canSetReturnType()) ? parsed.data.returnType : undefined;
    await recordEntry(
      parsed.data.sku,
      parsed.data.action as RegisterAction,
      parsed.data.qty,
      parsed.data.channel,
      date,
      parsed.data.trackingId,
      parsed.data.condition,
      returnType,
      parsed.data.orderId,
      parsed.data.allowDuplicate === true,
      parsed.data.expectedUnits,
    );
    return Response.json({ ok: true });
  } catch (err) {
    // Already logged: 409 + duplicate so the form can ask "log it again?".
    if (err instanceof DuplicateReturnError) return Response.json({ error: err.message, duplicate: true }, { status: 409 });
    const status = err instanceof InsufficientStockError ? 409 : 400;
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
