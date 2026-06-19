import { ingestAllOrders } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/** POST /api/orders/ingest -> pull new orders from all channels and post SOLD. */
export async function POST() {
  const results = await ingestAllOrders();
  return Response.json({ ok: true, results });
}
