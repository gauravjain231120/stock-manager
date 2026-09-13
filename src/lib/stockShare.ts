// Server-only: this file imports the Product model directly, so nothing
// here may be imported from a 'use client' component — do that through
// lib/constants.ts's plain, DB-free exports instead. Kept as its own module
// specifically so constants.ts (imported by many client components for
// PLATFORMS/PLATFORM_LABELS/etc.) never pulls Mongoose into the browser
// bundle via this file's dynamic or static model import.
import { ProductModel } from '@/models/Product';

/**
 * Bundle products that ship another SKU's physical stock — configured per
 * variant from the Products page (Product.sharesStockWith), not hardcoded.
 * A matching SKU keeps its own ledger entries (so its sales stay visible),
 * but every on-hand/reserved effect lands on the shared SKU instead. E.g.
 * "Halter with Palazzos" ships the matching "Halter Neck" top — packing a
 * set takes one halter off that pile, not its own.
 *
 * Short-TTL cache: stockSkuFor is called many times per request (often in
 * loops), so it can't hit the DB every time, but a change made in the UI
 * should take effect within a few seconds, not require a redeploy.
 */
const STOCK_SHARE_CACHE_TTL_MS = 5000;
let stockShareCache: { map: Map<string, string>; loadedAt: number } | null = null;

async function loadStockShareMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (stockShareCache && now - stockShareCache.loadedAt < STOCK_SHARE_CACHE_TTL_MS) return stockShareCache.map;
  const docs = await ProductModel.find({ sharesStockWith: { $exists: true, $ne: null } }, { sku: 1, sharesStockWith: 1 }).lean();
  const map = new Map<string, string>();
  for (const d of docs) if (d.sharesStockWith) map.set(d.sku, d.sharesStockWith);
  stockShareCache = { map, loadedAt: now };
  return map;
}

/** Call after any write to Product.sharesStockWith so the change is visible immediately. */
export function invalidateStockShareCache() {
  stockShareCache = null;
}

/**
 * The SKU whose physical stock a given SKU uses (itself unless it shares
 * stock with another). Follows the whole chain — A sharing with B, which
 * itself shares with C, resolves straight to C — since setSharesStockWith
 * allows chains and only blocks actual loops. The seen-set is a defensive
 * backstop in case a loop ever gets in some other way; it should never
 * trigger given that guard.
 */
export async function stockSkuFor(sku: string): Promise<string> {
  const map = await loadStockShareMap();
  let current = sku;
  const seen = new Set<string>();
  while (map.has(current) && !seen.has(current)) {
    seen.add(current);
    current = map.get(current)!;
  }
  return current;
}
