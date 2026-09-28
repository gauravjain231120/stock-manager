import { cancelPackedLine } from '@/lib/register';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pending/cancel-packed { orderId, sku, qty, requestId, trackingId?, note? }
 *
 * Called by the order-alert app's Myntra Cancel page when a packed parcel is
 * cancelled before it leaves (the courier refused it at pickup): its Shipped
 * entry is marked Cancelled and the units go back in stock — or, still in
 * Ready to Ship, it's taken out of the queue (see cancelPackedLine). Under
 * /api/pending so the app's shared service token (scoped to this prefix —
 * src/proxy.ts) covers it. `requestId` is required: a retry of the same
 * request only does what the first try didn't.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.orderId ?? '').trim();
  const sku = String(body?.sku ?? '').trim();
  const qty = Number(body?.qty);
  const requestId = typeof body?.requestId === 'string' ? body.requestId.trim().slice(0, 200) : '';
  const trackingId = typeof body?.trackingId === 'string' ? body.trackingId : undefined;
  const note = typeof body?.note === 'string' ? body.note : undefined;

  if (!orderId || !sku || !requestId || !Number.isInteger(qty) || qty <= 0) {
    return Response.json({ error: 'orderId, sku, requestId and a positive integer qty are required' }, { status: 400 });
  }

  try {
    const result = await cancelPackedLine({ orderId, sku, qty, trackingId, requestId, note });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // A real failure (database down…) — 500, so the caller can retry the same request.
    console.error('cancel-packed failed:', err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
