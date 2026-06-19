import { Channel } from '@/lib/constants';
import { MarketplaceAdapter, NormalizedOrder, NormalizedReturn, StockPushResult } from './types';

/**
 * Flipkart adapter (Seller API v3.0). SKELETON — fill in once you have Developer
 * Access (Seller Dashboard -> Manage Profile -> Developer Access -> self-access app).
 *
 * Set in env to go live:
 *   FLIPKART_APP_ID, FLIPKART_APP_SECRET   (OAuth client credentials)
 *
 * What to implement:
 *   auth        -> POST https://api.flipkart.net/oauth-service/oauth/token
 *                  (grant_type=client_credentials, scope=Seller_Api). Cache the token.
 *   pullOrders  -> Order Management API: POST /sellers/v3/shipments/search (filter by
 *                  state/created date), then read order items.
 *   pullReturns -> Returns API: list returns (CREATED -> COMPLETED -> CANCELLED).
 *   pushStock   -> Listing Management API: POST /listings/v3/update/{sku} (or the
 *                  inventory update endpoint) to set available inventory per SKU.
 *
 * Map everything into the Normalized* shapes in ./types.
 */
export class FlipkartAdapter implements MarketplaceAdapter {
  readonly channel = Channel.FLIPKART;

  isConfigured() {
    return Boolean(process.env.FLIPKART_APP_ID && process.env.FLIPKART_APP_SECRET);
  }

  private notReady(): never {
    throw new Error(
      'FlipkartAdapter not implemented. Add Flipkart Developer Access credentials and implement the API calls (see src/lib/marketplace/flipkart.ts).',
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
