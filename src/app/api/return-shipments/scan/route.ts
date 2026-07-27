import { findExpectedByTracking } from '@/lib/returnShipments';
import { ProductModel } from '@/models/Product';

export const dynamic = 'force-dynamic';

/** POST /api/return-shipments/scan { trackingId } -> the matching parcel, or 404. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const trackingId = String(body?.trackingId ?? '');
  try {
    const rec = await findExpectedByTracking(trackingId);
    if (!rec) {
      return Response.json({ error: 'No return found for this tracking number' }, { status: 404 });
    }
    if (rec.status === 'RECEIVED') {
      return Response.json({ error: `Already received on ${new Date(rec.receivedAt as unknown as Date).toLocaleDateString('en-IN')}` }, { status: 409 });
    }
    const product = await ProductModel.findOne({ sku: rec.sku }, { name: 1 }).lean();
    return Response.json({
      ok: true,
      id: String(rec._id),
      trackingId: rec.trackingId,
      sku: rec.sku,
      name: product?.name ?? rec.sku,
      channel: rec.channel ?? null,
      orderId: rec.orderId ?? null,
      qty: rec.qty,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
