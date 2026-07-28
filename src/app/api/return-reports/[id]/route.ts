import { deleteReturnReport, setReportItemSettled, updateReturnReport } from '@/lib/returnReports';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/return-reports/[id]
 *   { text, platform?, date? }      -> rewrite the tracking list / details
 *   { trackingId, settled }         -> mark one line claimed or outstanding
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    if (typeof body?.text === 'string') {
      return Response.json(await updateReturnReport(id, {
        text: body.text,
        platform: typeof body?.platform === 'string' ? body.platform : undefined,
        date: typeof body?.date === 'string' && body.date ? new Date(body.date) : undefined,
      }));
    }
    if (typeof body?.trackingId === 'string') {
      return Response.json(await setReportItemSettled(id, body.trackingId, Boolean(body.settled)));
    }
    return Response.json({ error: 'Nothing to change' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/return-reports/[id] -> remove a saved report. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return Response.json(await deleteReturnReport(id));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
