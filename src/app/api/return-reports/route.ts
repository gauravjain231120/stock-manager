import { createReturnReport } from '@/lib/returnReports';

export const dynamic = 'force-dynamic';

/** POST /api/return-reports -> save a platform's return report (a list of tracking numbers). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await createReturnReport({
      platform: typeof body?.platform === 'string' ? body.platform : undefined,
      date: typeof body?.date === 'string' && body.date ? new Date(body.date) : undefined,
      text: String(body?.text ?? ''),
    });
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
