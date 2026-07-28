import { deleteReturnReport, setReportItemSettled } from '@/lib/returnReports';

export const dynamic = 'force-dynamic';

/** PATCH /api/return-reports/[id] { trackingId, settled } -> mark a line claimed/outstanding. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.trackingId !== 'string') {
    return Response.json({ error: 'Which line?' }, { status: 400 });
  }
  try {
    return Response.json(await setReportItemSettled(id, body.trackingId, Boolean(body.settled)));
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
