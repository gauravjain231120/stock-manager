import { shipOrder } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/** POST /api/pending/ship-order { orderId, trackingId } -> ship a whole order as one parcel. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await shipOrder(
      String(body?.orderId ?? ''),
      typeof body?.trackingId === 'string' ? body.trackingId : undefined,
    );
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
