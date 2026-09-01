import { z } from 'zod';
import { addPending, pendingCount } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

const Add = z.object({
  sku: z.string().min(1),
  qty: z.number().int().min(1),
  channel: z.string().optional(),
  orderId: z.string().optional(),
  trackingId: z.string().optional(),
  placedAt: z.string().datetime().optional(),
  shipByAt: z.string().datetime().optional(),
});

/** GET /api/pending -> { count } (for the sidebar badge). */
export async function GET() {
  return Response.json({ count: await pendingCount() });
}

/** POST /api/pending -> add an order to the Ready-to-Ship queue (reserves stock). */
export async function POST(req: Request) {
  const parsed = Add.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Provide sku and qty' }, { status: 400 });
  try {
    const res = await addPending(parsed.data);
    return Response.json({ ok: true, ...res }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
