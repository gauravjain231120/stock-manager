import { connectDB } from '@/lib/db';
import { Channel, CHANNELS, SystemLocation } from '@/lib/constants';
import { getAdapter } from '@/lib/marketplace/registry';
import { syncSkus } from '@/lib/sync';
import { ChannelListingModel } from '@/models/ChannelListing';
import { MarketplaceOrderModel } from '@/models/MarketplaceOrder';
import { SyncStateModel } from '@/models/SyncState';
import { addPending } from '@/lib/shipping';

export interface IngestResult {
  channel: Channel;
  pulled: number;
  created: number;
  fulfilled: number;
  needsStock: number;
}

export async function ingestOrders(channel: Channel): Promise<IngestResult> {
  await connectDB();
  const adapter = getAdapter(channel);

  const cursorKey = `${channel}:orders`;
  const cursor = await SyncStateModel.findOne({ key: cursorKey }).lean();
  const orders = await adapter.pullOrders(cursor?.lastSyncAt ?? undefined);

  const res: IngestResult = { channel, pulled: orders.length, created: 0, fulfilled: 0, needsStock: 0 };
  const affected = new Set<string>();

  // Retry existing NEEDS_STOCK orders (unmapped SKUs)
  const pendingOrders = await MarketplaceOrderModel.find({ channel, status: 'NEEDS_STOCK' });
  for (const pOrder of pendingOrders) {
    let allFulfilled = true;
    for (const line of pOrder.lines) {
      if (line.fulfilled) continue;
      
      const listing = await ChannelListingModel.findOne({ channel, channelSku: line.channelSku }).lean();
      if (!listing) {
        allFulfilled = false;
        continue;
      }
      
      await addPending({
        sku: listing.sku,
        qty: line.qty,
        channel,
        orderId: pOrder.channelOrderId,
        placedAt: pOrder.placedAt,
      });
      line.sku = listing.sku;
      line.fulfilled = true;
      line.issue = undefined;
      affected.add(listing.sku);
      res.fulfilled++;
    }
    
    if (allFulfilled) {
      pOrder.status = 'FULFILLED';
    }
    await pOrder.save();
  }

  for (const order of orders) {
    const exists = await MarketplaceOrderModel.exists({
      channel,
      channelOrderId: order.channelOrderId,
    });
    if (exists) continue;

    let status: 'FULFILLED' | 'NEEDS_STOCK' = 'FULFILLED';
    const lines = [];

    for (const line of order.lines) {
      const listing = await ChannelListingModel.findOne({
        channel,
        channelSku: line.channelSku,
      }).lean();

      if (!listing) {
        status = 'NEEDS_STOCK';
        lines.push({ channelSku: line.channelSku, qty: line.qty, price: line.price, fulfilled: false, issue: 'UNMAPPED' });
        res.needsStock++;
        continue;
      }

      await addPending({
        sku: listing.sku,
        qty: line.qty,
        channel,
        orderId: order.channelOrderId,
        placedAt: order.placedAt,
      });
      lines.push({ channelSku: line.channelSku, sku: listing.sku, qty: line.qty, price: line.price, fulfilled: true });
      affected.add(listing.sku);
      res.fulfilled++;
    }

    try {
      await MarketplaceOrderModel.create({
        channel,
        channelOrderId: order.channelOrderId,
        placedAt: order.placedAt,
        status,
        lines,
      });
      res.created++;
    } catch (err: unknown) {
      if (!(err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000)) {
        throw err;
      }
    }
  }

  await SyncStateModel.updateOne(
    { key: cursorKey },
    { $set: { lastSyncAt: new Date() } },
    { upsert: true },
  );

  // After selling, push the new available quantity to every channel for the
  // affected SKUs (the anti-oversell resync).
  if (affected.size) await syncSkus([...affected]);

  return res;
}

/** Pull orders for every channel. */
export async function ingestAllOrders(): Promise<IngestResult[]> {
  const out: IngestResult[] = [];
  for (const channel of CHANNELS) out.push(await ingestOrders(channel));
  return out;
}

export async function listOrders(limit = 50) {
  await connectDB();
  return MarketplaceOrderModel.find().sort({ placedAt: -1 }).limit(limit).lean();
}
