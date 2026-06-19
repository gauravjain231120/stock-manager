import { Channel } from '@/lib/constants';

/**
 * Normalized shapes every channel is translated into. The rest of the app only
 * ever sees these — never a raw Amazon/Flipkart/Myntra payload. Each real adapter
 * is responsible for mapping the marketplace's API response into these.
 */

export interface NormalizedOrderLine {
  channelSku: string; // the SKU as the marketplace knows it
  qty: number;
  price?: number;
}

export interface NormalizedOrder {
  channel: Channel;
  channelOrderId: string; // marketplace order id (used for idempotency)
  placedAt: Date;
  lines: NormalizedOrderLine[];
}

export interface NormalizedReturn {
  channel: Channel;
  channelReturnId: string; // marketplace return id (idempotency)
  channelOrderId?: string;
  channelSku: string;
  qty: number;
  reason?: string;
  receivedAt: Date;
}

export interface StockPush {
  channelSku: string;
  qty: number; // quantity to publish to the channel
}

export interface StockPushResult {
  channelSku: string;
  ok: boolean;
  error?: string;
}

/**
 * The contract every marketplace integration fulfils. Build Amazon, then Flipkart,
 * then Myntra against this; the sync engine and order ingestion don't care which
 * channel they're talking to.
 */
export interface MarketplaceAdapter {
  readonly channel: Channel;
  /** Is this adapter configured with credentials and ready to use? */
  isConfigured(): boolean;
  /** Orders placed since `since` (or all recent if omitted). */
  pullOrders(since?: Date): Promise<NormalizedOrder[]>;
  /** Returns initiated/received since `since`. */
  pullReturns(since?: Date): Promise<NormalizedReturn[]>;
  /** Publish new available quantities to the channel. */
  pushStock(updates: StockPush[]): Promise<StockPushResult[]>;
}
