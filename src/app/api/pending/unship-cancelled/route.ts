import { unshipCancelledLine } from '@/lib/register';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pending/unship-cancelled { orderId, sku, qty }
 *
 * Called by the order-alert app when a marketplace reports an order
 * cancelled after it was already shipped (presumed RTO) — restores up to
 * `qty` units of `sku` on `orderId` from Shipped back to available stock,
 * without re-adding anything to Ready to Ship. Deliberately lives under
 * /api/pending so the alert app's existing shared service token (scoped to
 * this prefix only — see src/proxy.ts) already covers it, without widening
 * that token's reach into the rest of the Stock Log.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.orderId ?? '').trim();
  const sku = String(body?.sku ?? '').trim();
  const qty = Number(body?.qty);
  // Optional: other numbers the order goes by (Myntra portalOrderReleaseIds) —
  // remembered so a return logged under one of them isn't counted twice.
  const altOrderIds = Array.isArray(body?.altOrderIds) ? body.altOrderIds.map((a: unknown) => String(a)).filter(Boolean) : [];

  if (!orderId || !sku || !Number.isInteger(qty) || qty <= 0) {
    return Response.json({ error: 'orderId, sku, and a positive integer qty are required' }, { status: 400 });
  }

  try {
    const result = await unshipCancelledLine({ orderId, sku, qty, altOrderIds });
    return Response.json({ ok: result.remaining === 0, ...result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
