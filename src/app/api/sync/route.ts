import { syncAll, channelStates } from '@/lib/sync';

export const dynamic = 'force-dynamic';

/** GET /api/sync -> what each channel currently believes (last push). */
export async function GET() {
  const states = await channelStates();
  return Response.json({ states });
}

/** POST /api/sync -> recompute and push available stock to all channels. */
export async function POST() {
  const results = await syncAll();
  const changed = results.filter((r) => r.changed).length;
  const failed = results.filter((r) => !r.ok).length;
  return Response.json({ ok: true, pushed: results.length, changed, failed, results });
}
