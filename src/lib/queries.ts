import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { SkuStockModel } from '@/models/SkuStock';
import { ChannelListingModel } from '@/models/ChannelListing';
import { LocationModel } from '@/models/Location';
import { movementSummary } from '@/lib/stock';
import { stockSkuFor } from '@/lib/stockShare';
import { attrsOf } from '@/lib/variants';

export interface InventoryRow {
  sku: string;
  name: string;
  category: string;
  onHand: number;
  available: number;
  channels: number;
  color?: string;
}

export interface InventoryOverview {
  summary: {
    made: number;
    sold: number;
    returned: number;
    adjusted: number;
  };
  totals: { skus: number; units: number; damaged: number };
  rows: InventoryRow[];
}

/**
 * One read for the dashboard: per-SKU current stock (summed across locations),
 * how many channels each SKU is listed on, and the Made/Sold/Returned totals
 * computed straight from the ledger.
 */
export async function getInventoryOverview(): Promise<InventoryOverview> {
  await connectDB();

  const [products, stock, listings, locations, summary] = await Promise.all([
    ProductModel.find().sort({ sku: 1 }).lean(),
    SkuStockModel.find().lean(),
    ChannelListingModel.find().lean(),
    LocationModel.find().lean(),
    movementSummary(),
  ]);

  // Only SELLABLE-kind locations count toward sellable on-hand; DAMAGED is tracked
  // separately and never shown as available.
  const kindByLoc = new Map(locations.map((l) => [l.code, l.kind]));

  const sellableBySku = new Map<string, { onHand: number; reserved: number }>();
  let damaged = 0;
  for (const s of stock) {
    const kind = kindByLoc.get(s.locationCode) ?? 'SELLABLE';
    if (kind === 'DAMAGED') {
      damaged += s.onHand;
      continue;
    }
    if (kind !== 'SELLABLE') continue; // QUARANTINE not counted as sellable
    const cur = sellableBySku.get(s.sku) ?? { onHand: 0, reserved: 0 };
    cur.onHand += s.onHand;
    cur.reserved += s.reserved;
    sellableBySku.set(s.sku, cur);
  }

  const listingsBySku = new Map<string, number>();
  for (const l of listings) {
    listingsBySku.set(l.sku, (listingsBySku.get(l.sku) ?? 0) + 1);
  }

  const pileBySku = new Map(await Promise.all(products.map(async (p) => [p.sku, await stockSkuFor(p.sku)] as const)));

  const rows: InventoryRow[] = products.map((p) => {
    // Bundles show their component's pool (e.g. the set shows halter stock).
    const s = sellableBySku.get(pileBySku.get(p.sku)!) ?? { onHand: 0, reserved: 0 };
    return {
      sku: p.sku,
      name: p.name,
      category: p.category ?? '',
      onHand: s.onHand,
      available: s.onHand - s.reserved,
      channels: listingsBySku.get(p.sku) ?? 0,
      color: attrsOf(p.attributes).color?.trim() || undefined,
    };
  });

  // A bundle's units are the same physical pieces as its component's — count each pool once.
  const units = rows.reduce((acc, r) => acc + (pileBySku.get(r.sku) === r.sku ? r.onHand : 0), 0);

  return { summary, totals: { skus: rows.length, units, damaged }, rows };
}
