import { z } from 'zod';
import { generateRandomOrders } from '@/lib/marketplace/simulator';
import { CHANNELS, Channel } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const Body = z.object({
  channel: z.enum(CHANNELS as [string, ...string[]]).optional(),
  count: z.number().int().positive().max(200).default(5),
});

/**
 * POST /api/orders/simulate -> enqueue fake orders (dev only; uses the simulator).
 * Then call POST /api/orders/ingest to process them into SOLD movements.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { channel, count } = parsed.data;
  const channels = channel ? [channel as Channel] : (CHANNELS as Channel[]);
  let total = 0;
  for (const ch of channels) total += await generateRandomOrders(ch, count);
  return Response.json({ ok: true, enqueued: total });
}
