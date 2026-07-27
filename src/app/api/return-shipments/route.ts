import { addExpectedReturn, expectedReturnCount } from '@/lib/returnShipments';

export const dynamic = 'force-dynamic';

/** GET /api/return-shipments -> how many parcels are still on their way. */
export async function GET() {
  try {
    return Response.json({ count: await expectedReturnCount() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** POST /api/return-shipments -> log a return the customer has initiated. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await addExpectedReturn({
      trackingId: String(body?.trackingId ?? ''),
      sku: String(body?.sku ?? ''),
      channel: typeof body?.channel === 'string' ? body.channel : undefined,
      orderId: typeof body?.orderId === 'string' ? body.orderId : undefined,
      qty: typeof body?.qty === 'number' ? body.qty : undefined,
      date: typeof body?.date === 'string' && body.date ? new Date(body.date) : undefined,
    });
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
