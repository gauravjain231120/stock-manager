import { Channel } from '@/lib/constants';
import { MarketplaceAdapter, NormalizedOrder, NormalizedReturn, StockPushResult } from './types';

/**
 * Myntra adapter. SKELETON — and the HARDEST integration. Your self-ship model is
 * Myntra **PPMP** (you hold inventory). Direct PPMP API access requires Myntra
 * onboarding (Merchant ID + Secret Key + facility/warehouse code). Most sellers
 * integrate via a connector (**Increff Assure** or **Unicommerce**) instead of raw
 * PPMP — strongly consider that before building this from scratch.
 *
 * Set in env to go live (direct PPMP):
 *   MYNTRA_MERCHANT_ID, MYNTRA_SECRET_KEY, MYNTRA_FACILITY_CODE
 * Or, if using a connector, point this adapter at the connector's API instead.
 *
 * What to implement (direct PPMP, current API version):
 *   pullOrders  -> PPMP order list endpoint for your facility.
 *   pullReturns -> PPMP returns endpoint.
 *   pushStock   -> PPMP inventory update for your facility/warehouse code.
 *
 * Map everything into the Normalized* shapes in ./types.
 */
export class MyntraAdapter implements MarketplaceAdapter {
  readonly channel = Channel.MYNTRA;

  isConfigured() {
    return Boolean(
      process.env.MYNTRA_MERCHANT_ID &&
        process.env.MYNTRA_SECRET_KEY &&
        process.env.MYNTRA_FACILITY_CODE,
    );
  }

  private notReady(): never {
    throw new Error(
      'MyntraAdapter not implemented. Use Myntra PPMP credentials (or an Increff/Unicommerce connector) and implement the API calls (see src/lib/marketplace/myntra.ts).',
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
