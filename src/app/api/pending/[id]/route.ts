import { shipPending, cancelPending, editPending, setPendingReady } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/** POST /api/pending/[id] -> ship some/all of this item (deduct stock, release reservation). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as { qty?: number; trackingId?: string; orderId?: string }));
  const qty = typeof body?.qty === 'number' ? body.qty : undefined;
  const trackingId = typeof body?.trackingId === 'string' ? body.trackingId : undefined;
  const orderId = typeof body?.orderId === 'string' ? body.orderId : undefined;
  try {
    const res = await shipPending(id, qty, trackingId, orderId);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** PATCH /api/pending/[id] -> fix a queued order before it ships. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await editPending(id, {
      sku: typeof body?.sku === 'string' ? body.sku : undefined,
      qty: typeof body?.qty === 'number' ? body.qty : undefined,
      channel: typeof body?.channel === 'string' ? body.channel : undefined,
      orderId: typeof body?.orderId === 'string' ? body.orderId : undefined,
      trackingId: typeof body?.trackingId === 'string' ? body.trackingId : undefined,
      placedAt: typeof body?.placedAt === 'string' ? body.placedAt : undefined,
      shipByAt: typeof body?.shipByAt === 'string' ? body.shipByAt : undefined,
    });
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** PUT /api/pending/[id] -> flip the "packed & set aside" flag (kept off the print sheet once set). */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as { ready?: boolean }));
  const ready = Boolean(body?.ready);
  try {
    const res = await setPendingReady(id, ready);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/**
 * DELETE /api/pending/[id] -> cancel some/all of this item (release reservation, no deduction).
 * Optional `requestId` makes a repeat of the same request safe (see cancelPending).
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({} as { qty?: number; requestId?: string }));
  const qty = typeof body?.qty === 'number' ? body.qty : undefined;
  const requestId = typeof body?.requestId === 'string' && body.requestId.trim() ? body.requestId.trim().slice(0, 200) : undefined;
  try {
    const res = await cancelPending(id, qty, requestId);
    return Response.json(res);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
