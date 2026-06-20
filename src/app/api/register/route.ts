import { z } from 'zod';
import { recordEntry, REGISTER_ACTIONS, RegisterAction } from '@/lib/register';
import { InsufficientStockError } from '@/lib/stock';
import { PLATFORMS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    sku: z.string().min(1),
    action: z.enum(REGISTER_ACTIONS as [string, ...string[]]),
    qty: z.number().int().positive(),
    channel: z.enum(PLATFORMS).optional(),
    date: z.string().optional(),
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
    await recordEntry(parsed.data.sku, parsed.data.action as RegisterAction, parsed.data.qty, parsed.data.channel, date);
    return Response.json({ ok: true });
  } catch (err) {
    const status = err instanceof InsufficientStockError ? 409 : 400;
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
