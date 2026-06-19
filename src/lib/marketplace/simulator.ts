import { connectDB } from '@/lib/db';
import { Channel } from '@/lib/constants';
import { SimulatedEventModel } from '@/models/SimulatedEvent';
import { ChannelListingModel } from '@/models/ChannelListing';
import {
  MarketplaceAdapter,
  NormalizedOrder,
  NormalizedReturn,
  StockPush,
  StockPushResult,
} from './types';

/**
 * SIMULATOR adapter — stands in for a real marketplace so the full pipeline (pull
 * orders -> sell -> sync stock -> returns) works locally with no credentials.
 *
 * Orders/returns come from the SimulatedEvent queue (seed them with the helpers
 * below or the "Simulate sales" button in the UI). pushStock records what we
 * "published" into ChannelInventoryState, exactly like a real adapter would track.
 */
export class SimulatorAdapter implements MarketplaceAdapter {
  constructor(readonly channel: Channel) {}

  isConfigured() {
    return true;
  }

  async pullOrders(): Promise<NormalizedOrder[]> {
    await connectDB();
    const events = await SimulatedEventModel.find({
      channel: this.channel,
      kind: 'ORDER',
      consumed: false,
    })
      .sort({ createdAt: 1 })
      .lean();

    if (events.length) {
      await SimulatedEventModel.updateMany(
        { _id: { $in: events.map((e) => e._id) } },
        { $set: { consumed: true } },
      );
    }

    return events.map((e) => {
      const p = e.payload as {
        channelOrderId: string;
        placedAt: Date;
        lines: { channelSku: string; qty: number; price?: number }[];
      };
      return {
        channel: this.channel,
        channelOrderId: p.channelOrderId,
        placedAt: new Date(p.placedAt),
        lines: p.lines,
      };
    });
  }

  async pullReturns(): Promise<NormalizedReturn[]> {
    await connectDB();
    const events = await SimulatedEventModel.find({
      channel: this.channel,
      kind: 'RETURN',
      consumed: false,
    })
      .sort({ createdAt: 1 })
      .lean();

    if (events.length) {
      await SimulatedEventModel.updateMany(
        { _id: { $in: events.map((e) => e._id) } },
        { $set: { consumed: true } },
      );
    }

    return events.map((e) => {
      const p = e.payload as {
        channelReturnId: string;
        channelOrderId?: string;
        channelSku: string;
        qty: number;
        reason?: string;
        receivedAt: Date;
      };
      return {
        channel: this.channel,
        channelReturnId: p.channelReturnId,
        channelOrderId: p.channelOrderId,
        channelSku: p.channelSku,
        qty: p.qty,
        reason: p.reason,
        receivedAt: new Date(p.receivedAt),
      };
    });
  }

  async pushStock(updates: StockPush[]): Promise<StockPushResult[]> {
    // The simulator "accepts" every push. The sync service records what we pushed
    // in ChannelInventoryState; a real adapter would call the marketplace API here.
    return updates.map((u) => ({ channelSku: u.channelSku, ok: true }));
  }
}

// --- helpers to seed simulated activity (UI button + e2e test) ---

let counter = 0;
function nextId(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function enqueueSimulatedOrder(
  channel: Channel,
  lines: { channelSku: string; qty: number; price?: number }[],
  channelOrderId?: string,
) {
  await connectDB();
  await SimulatedEventModel.create({
    kind: 'ORDER',
    channel,
    payload: {
      channelOrderId: channelOrderId ?? nextId('SIMORD'),
      placedAt: new Date(),
      lines,
    },
  });
}

export async function enqueueSimulatedReturn(
  channel: Channel,
  channelSku: string,
  qty: number,
  reason = 'Customer return',
  channelReturnId?: string,
) {
  await connectDB();
  await SimulatedEventModel.create({
    kind: 'RETURN',
    channel,
    payload: {
      channelReturnId: channelReturnId ?? nextId('SIMRET'),
      channelSku,
      qty,
      reason,
      receivedAt: new Date(),
    },
  });
}

/**
 * Generate `count` random orders across active listings on a channel — for the
 * "Simulate sales" button. Each order buys 1–3 units of a random listed SKU.
 */
export async function generateRandomOrders(channel: Channel, count: number) {
  await connectDB();
  const listings = await ChannelListingModel.find({ channel, active: true }).lean();
  if (!listings.length) return 0;
  let made = 0;
  for (let i = 0; i < count; i++) {
    const listing = listings[Math.floor(Math.random() * listings.length)];
    const qty = 1 + Math.floor(Math.random() * 3);
    await enqueueSimulatedOrder(channel, [
      { channelSku: listing.channelSku, qty, price: listing.price ?? undefined },
    ]);
    made++;
  }
  return made;
}
