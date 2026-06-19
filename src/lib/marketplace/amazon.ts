import { Channel } from '@/lib/constants';
import { MarketplaceAdapter, NormalizedOrder, NormalizedReturn, StockPushResult } from './types';

/**
 * Amazon adapter (SP-API / Selling Partner API). SKELETON — fill in the API calls
 * once you have SP-API credentials (LWA client id/secret + refresh token, and your
 * seller/marketplace id). Self-ship = MFN.
 *
 * Set in env to go live:
 *   AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET, AMAZON_REFRESH_TOKEN,
 *   AMAZON_SELLER_ID, AMAZON_MARKETPLACE_ID  (e.g. A21TJRUUN4KGV for amazon.in)
 *
 * What to implement:
 *   pullOrders  -> Orders API: GET /orders/v0/orders?CreatedAfter=...; then
 *                  GET /orders/v0/orders/{id}/orderItems for the lines.
 *   pullReturns -> Reports API: request a returns report (MFN returns), poll, parse.
 *   pushStock   -> Listings Items API: PATCH /listings/2021-08-01/items/{seller}/{sku}
 *                  setting attribute `fulfillment_availability.quantity`.
 *                  (The old Listings *Feeds* were retired in 2025 — use Listings Items.)
 *
 * All responses must be mapped into the Normalized* shapes in ./types.
 */
export class AmazonAdapter implements MarketplaceAdapter {
  readonly channel = Channel.AMAZON;

  isConfigured() {
    return Boolean(
      process.env.AMAZON_LWA_CLIENT_ID &&
        process.env.AMAZON_LWA_CLIENT_SECRET &&
        process.env.AMAZON_REFRESH_TOKEN &&
        process.env.AMAZON_SELLER_ID,
    );
  }

  private notReady(): never {
    throw new Error(
      'AmazonAdapter not implemented. Add SP-API credentials and implement the API calls (see src/lib/marketplace/amazon.ts).',
    );
  }

  async pullOrders(): Promise<NormalizedOrder[]> {
    this.notReady();
  }
  async pullReturns(): Promise<NormalizedReturn[]> {
    this.notReady();
  }
  async pushStock(): Promise<StockPushResult[]> {
    this.notReady();
  }
}
