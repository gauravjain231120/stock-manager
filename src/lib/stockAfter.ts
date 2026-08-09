import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';
import { SkuStockModel } from '@/models/SkuStock';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { SystemLocation, stockSkuFor } from '@/lib/constants';
import { compareVariant } from '@/lib/format';
import { variantMeta } from '@/lib/variants';

const MAIN = SystemLocation.MAIN;

/**
 * One product's stock once the whole Ready-to-Ship queue has gone out — the
 * number you'd count on the shelf tomorrow morning, not the one the system
 * shows today while orders sit reserved.
 */
export interface StockAfterRow {
  sku: string;
  name: string;
  category: string;
  color: string;
  size: string;
  /** The pile this SKU actually ships from — itself, unless it's a bundle. */
  stockSku: string;
  /** That pile's product name, only set when the pile isn't this SKU's own. */
  stockName: string | null;
  /** True when these units are another SKU's garments (bundle). */
  shared: boolean;
  onHand: number;
  /** Units of this SKU itself waiting in the queue. */
  queuedOwn: number;
  /** Every queued unit claiming this pile — a bundle's claims included. */
  queued: number;
  /** onHand − queued. Negative means the queue is oversold on this pile. */
  after: number;
}

export interface StockAfterReport {
  rows: StockAfterRow[];
  totals: {
    /** Piles, not rows — a bundle and its component are the same garments. */
    onHand: number;
    queued: number;
    after: number;
    /** Units that have to be made for the queue to go out in full. */
    short: number;
    /** How many piles are oversold. */
    shortSkus: number;
  };
  /** Queued units on SKUs no active product covers — flagged, never silently dropped. */
  unlisted: number;
}

/**
 * Stock for every active product with the queue's claims already taken off.
 *
 * Reads MAIN only, because MAIN is what the ship queue reserves against and
 * deducts from — quarantined returns aren't garments you can pack today.
 *
 * The arithmetic is per PHYSICAL pile, not per SKU: a bundle ships its
 * component's garments (V-Neck Kurti draws on Co-ord Set stock), so its queued
 * units have to come off that component's pile or the pile reads too high.
 * Both SKUs then show the same figures — they are the same garments, counted
 * once in the totals.
 */
export async function stockAfterQueue(): Promise<StockAfterReport> {
  await connectDB();

  const [products, stocks, pending, groups] = await Promise.all([
    ProductModel.find({ active: true }, { sku: 1, name: 1, groupCode: 1, category: 1, attributes: 1 }).lean(),
    SkuStockModel.find({ locationCode: MAIN }, { sku: 1, onHand: 1 }).lean(),
    PendingShipmentModel.find({}, { sku: 1, qty: 1 }).lean(),
    ProductGroupModel.find({}, { code: 1, name: 1 }).lean(),
  ]);

  const queuedByPile = new Map<string, number>();
  const queuedBySku = new Map<string, number>();
  for (const p of pending) {
    const pile = stockSkuFor(p.sku);
    queuedByPile.set(pile, (queuedByPile.get(pile) ?? 0) + p.qty);
    queuedBySku.set(p.sku, (queuedBySku.get(p.sku) ?? 0) + p.qty);
  }

  const onHandBy = new Map(stocks.map((s) => [s.sku, s.onHand ?? 0]));
  const groupNameBy = new Map(groups.map((g) => [g.code, g.name]));
  // Prefer the parent product's name ("Co-ord Set") — the row already carries
  // the colour and size in its own columns.
  const pileNameBy = new Map(
    products.map((p) => [p.sku, (p.groupCode && groupNameBy.get(p.groupCode)) || p.name]),
  );

  const rows: StockAfterRow[] = products
    .map((p) => {
      const pile = stockSkuFor(p.sku);
      const meta = variantMeta(p, p.groupCode ? groupNameBy.get(p.groupCode) : undefined);
      const onHand = onHandBy.get(pile) ?? 0;
      const queued = queuedByPile.get(pile) ?? 0;
      return {
        sku: p.sku,
        name: p.name,
        category: meta.category ?? '',
        color: meta.color ?? '',
        size: meta.size ?? p.sku.split('-').pop() ?? '',
        stockSku: pile,
        stockName: pile === p.sku ? null : pileNameBy.get(pile) ?? null,
        shared: pile !== p.sku,
        onHand,
        queuedOwn: queuedBySku.get(p.sku) ?? 0,
        queued,
        after: onHand - queued,
      };
    })
    .sort((a, b) => compareVariant(a.sku, b.sku));

  // Count each pile once, or every bundle would double its component's garments.
  const counted = new Set<string>();
  const totals = { onHand: 0, queued: 0, after: 0, short: 0, shortSkus: 0 };
  for (const r of rows) {
    if (counted.has(r.stockSku)) continue;
    counted.add(r.stockSku);
    totals.onHand += r.onHand;
    totals.queued += r.queued;
    if (r.after < 0) {
      totals.short += -r.after;
      totals.shortSkus += 1;
    }
  }
  totals.after = totals.onHand - totals.queued;

  // Anything queued against a pile no active product maps to (a product retired
  // while its orders were still in the queue) would vanish from the sheet.
  let unlisted = 0;
  for (const [pile, qty] of queuedByPile) if (!counted.has(pile)) unlisted += qty;

  return { rows, totals, unlisted };
}
