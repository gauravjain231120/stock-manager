import { Channel, CHANNELS } from '@/lib/constants';
import { MarketplaceAdapter } from './types';
import { SimulatorAdapter } from './simulator';
import { AmazonAdapter } from './amazon';
import { FlipkartAdapter } from './flipkart';
import { MyntraAdapter } from './myntra';

/**
 * Returns the adapter for a channel.
 *
 *   MARKETPLACE_MODE=simulate (default) -> always the simulator (no credentials)
 *   MARKETPLACE_MODE=live               -> the real adapter IF it's configured,
 *                                          otherwise falls back to the simulator
 *
 * This lets you flip channels to live one at a time as you get each marketplace's
 * credentials, without touching the sync engine or order ingestion.
 */
export function getAdapter(channel: Channel): MarketplaceAdapter {
  const mode = process.env.MARKETPLACE_MODE ?? 'simulate';
  if (mode !== 'live') return new SimulatorAdapter(channel);

  const real: MarketplaceAdapter =
    channel === Channel.AMAZON
      ? new AmazonAdapter()
      : channel === Channel.FLIPKART
        ? new FlipkartAdapter()
        : new MyntraAdapter();

  return real.isConfigured() ? real : new SimulatorAdapter(channel);
}

export function allAdapters(): MarketplaceAdapter[] {
  return CHANNELS.map((c) => getAdapter(c));
}
