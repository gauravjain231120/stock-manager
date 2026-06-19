import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { ChannelListingModel } from '@/models/ChannelListing';
import { CHANNELS, Channel } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/** GET /api/channel-listings -> all SKU↔marketplace mappings. */
export async function GET() {
  await connectDB();
  const listings = await ChannelListingModel.find().sort({ sku: 1, channel: 1 }).lean();
  return Response.json({ listings });
}

const Upsert = z.object({
  sku: z.string().min(1),
  channel: z.enum(CHANNELS as [string, ...string[]]),
  channelSku: z.string().min(1),
  listingId: z.string().optional(),
  price: z.number().min(0).optional(),
});

/** POST /api/channel-listings -> create/update a mapping for (sku, channel). */
export async function POST(request: Request) {
  await connectDB();
  const parsed = Upsert.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  const sku = d.sku.trim().toUpperCase();
  try {
    await ChannelListingModel.updateOne(
      { channel: d.channel as Channel, channelSku: d.channelSku },
      { $set: { sku, listingId: d.listingId, price: d.price, active: true } },
      { upsert: true },
    );
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      return Response.json({ error: 'That SKU/channel mapping conflicts with an existing one' }, { status: 409 });
    }
    throw err;
  }
  return Response.json({ ok: true });
}
