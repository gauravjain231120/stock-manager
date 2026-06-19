import { connectDB } from '@/lib/db';
import { Channel } from '@/lib/constants';
import { getAdapter } from '@/lib/marketplace/registry';
import { SkuStockModel } from '@/models/SkuStock';
import { LocationModel } from '@/models/Location';
import { ChannelListingModel } from '@/models/ChannelListing';
import { ChannelInventoryStateModel } from '@/models/ChannelInventoryState';

/**
 * Stock sync engine — pushes the correct available quantity to every channel a SKU
 * is listed on, so we never oversell.
 *
 * publishable = max(0, sellableAvailable - buffer)
 *   sellableAvailable = sum over SELLABLE locations of (onHand - reserved)
 *   buffer            = safety units withheld (per SKU, held on the MAIN row)
 *
 * Pushing slightly LESS than we have is the safe direction; the buffer absorbs the
 * lag between a sale on one channel and the resync of the others.
 */

async function sellableLocationCodes(): Promise<Set<string>> {
  const locs = await LocationModel.find({ kind: 'SELLABLE' }).lean();
  return new Set(locs.map((l) => l.code));
}

/** Publishable quantity for a single SKU. */
export async function publishableQty(sku: string, sellable?: Set<string>): Promise<number> {
  const sellableCodes = sellable ?? (await sellableLocationCodes());
  const rows = await SkuStockModel.find({ sku }).lean();
  let available = 0;
  let buffer = 0;
  for (const r of rows) {
    if (!sellableCodes.has(r.locationCode)) continue;
    available += r.onHand - r.reserved;
    buffer += r.buffer;
  }
  return Math.max(0, available - buffer);
}

export interface SyncChannelResult {
  channel: Channel;
  channelSku: string;
  qty: number;
  ok: boolean;
  changed: boolean;
  error?: string;
}

/** Sync one SKU to all channels it is listed on. */
export async function syncSku(sku: string, sellable?: Set<string>): Promise<SyncChannelResult[]> {
  await connectDB();
  const sellableCodes = sellable ?? (await sellableLocationCodes());
  const skuU = sku.trim().toUpperCase();
  const qty = await publishableQty(skuU, sellableCodes);

  const listings = await ChannelListingModel.find({ sku: skuU, active: true }).lean();
  const results: SyncChannelResult[] = [];

  // group by channel for a single push per channel
  const byChannel = new Map<Channel, { channelSku: string }[]>();
  for (const l of listings) {
    const arr = byChannel.get(l.channel as Channel) ?? [];
    arr.push({ channelSku: l.channelSku });
    byChannel.set(l.channel as Channel, arr);
  }

  for (const [channel, items] of byChannel) {
    const adapter = getAdapter(channel);
    for (const item of items) {
      const prior = await ChannelInventoryStateModel.findOne({ channel, channelSku: item.channelSku }).lean();
      const changed = !prior || prior.publishedQty !== qty;
      try {
        const [pushRes] = await adapter.pushStock([{ channelSku: item.channelSku, qty }]);
        const ok = pushRes?.ok ?? false;
        await ChannelInventoryStateModel.updateOne(
          { channel, channelSku: item.channelSku },
          { $set: { sku: skuU, publishedQty: qty, lastPushedAt: new Date(), lastError: ok ? null : pushRes?.error } },
          { upsert: true },
        );
        results.push({ channel, channelSku: item.channelSku, qty, ok, changed, error: pushRes?.error });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await ChannelInventoryStateModel.updateOne(
          { channel, channelSku: item.channelSku },
          { $set: { sku: skuU, lastError: error } },
          { upsert: true },
        );
        results.push({ channel, channelSku: item.channelSku, qty, ok: false, changed, error });
      }
    }
  }

  return results;
}

/** Sync a specific set of SKUs (use after orders/production/returns). */
export async function syncSkus(skus: string[]) {
  const sellable = await sellableLocationCodes();
  const unique = [...new Set(skus.map((s) => s.trim().toUpperCase()))];
  const out: SyncChannelResult[] = [];
  for (const sku of unique) out.push(...(await syncSku(sku, sellable)));
  return out;
}

/** Sync every SKU that has at least one channel listing. */
export async function syncAll() {
  await connectDB();
  const skus = await ChannelListingModel.distinct('sku', { active: true });
  return syncSkus(skus as string[]);
}

/** What each channel currently believes (our last successful push). */
export async function channelStates() {
  await connectDB();
  return ChannelInventoryStateModel.find().sort({ sku: 1, channel: 1 }).lean();
}
