import { z } from 'zod';
import { enqueueSimulatedReturn } from '@/lib/marketplace/simulator';
import { CHANNELS, Channel } from '@/lib/constants';
import { ChannelListingModel } from '@/models/ChannelListing';
import { connectDB } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  channel: z.enum(CHANNELS as [string, ...string[]]).optional(),
  count: z.number().int().positive().max(50).default(3),
});

/**
 * POST /api/returns/simulate -> enqueue fake returns of random listed SKUs (dev).
 * Then POST /api/returns/ingest to land them in QUARANTINE for grading.
 */
export async function POST(request: Request) {
  await connectDB();
  const parsed = Body.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { channel, count } = parsed.data;
  const channels = channel ? [channel as Channel] : (CHANNELS as Channel[]);

  let enqueued = 0;
  for (const ch of channels) {
    const listings = await ChannelListingModel.find({ channel: ch, active: true }).lean();
    if (!listings.length) continue;
    for (let i = 0; i < count; i++) {
      const l = listings[Math.floor(Math.random() * listings.length)];
      await enqueueSimulatedReturn(ch, l.channelSku, 1);
      enqueued++;
    }
  }
  return Response.json({ ok: true, enqueued });
}
