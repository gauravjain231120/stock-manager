export const dynamic = 'force-dynamic';

/**
 * GET /api/resolve-myntra-return?trackingId=MYSR...
 *
 * Proxies the sister order-alert-bot's own resolver (that app holds the live
 * Myntra session, this one doesn't) — chains the SPF claim lookup into the
 * packed-order search and hands back { sku, size, color, image, returnReason,
 * returnMode, returnTrackingId, originalTrackingId }. This is the one call
 * that goes stock-manager -> the bot; every other integration point between
 * these two apps goes the other way. Never writes anything itself — the
 * caller decides whether/how to log a return with the resolved data.
 */
export async function GET(request: Request) {
  const trackingId = new URL(request.url).searchParams.get('trackingId')?.trim();
  if (!trackingId) {
    return Response.json({ error: 'trackingId is required' }, { status: 400 });
  }

  const botUrl = process.env.MYNTRA_BOT_URL;
  const secret = process.env.MYNTRA_BOT_RESOLVE_SECRET;
  if (!botUrl || !secret) {
    return Response.json(
      { error: 'Myntra return resolver is not configured (MYNTRA_BOT_URL / MYNTRA_BOT_RESOLVE_SECRET missing).' },
      { status: 500 },
    );
  }

  let res: Response;
  try {
    res = await fetch(`${botUrl}/api/resolve-return?trackingId=${encodeURIComponent(trackingId)}`, {
      headers: { 'x-resolve-secret': secret },
      cache: 'no-store',
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not reach the resolver' }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json({ error: data.error || `Resolver returned HTTP ${res.status}` }, { status: res.status === 404 ? 404 : 502 });
  }
  return Response.json(data);
}
