import { connectDB } from '@/lib/db';
import { MovementType } from '@/lib/constants';
import { StockMovementModel } from '@/models/StockMovement';
import { SkuStockModel } from '@/models/SkuStock';
import { ProductModel } from '@/models/Product';
import { LocationModel } from '@/models/Location';
import { ReorderPolicyModel } from '@/models/ReorderPolicy';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LEAD_DAYS = 7;
const DEFAULT_SAFETY = 0;

/** Average units sold per day per SKU over the last `days`. */
async function salesVelocity(days: number): Promise<Map<string, number>> {
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const rows = await StockMovementModel.aggregate<{ _id: string; sold: number }>([
    { $match: { type: MovementType.SOLD, createdAt: { $gte: cutoff } } },
    { $group: { _id: '$sku', sold: { $sum: '$qty' } } }, // qty is negative
  ]);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r._id, -r.sold / days);
  return map;
}

/** Sellable available (on-hand minus reserved) per SKU, summed across SELLABLE
 *  locations — NOT raw on-hand. A pile with more queued than physically in
 *  stock (oversold) legitimately shows negative here, same concept as
 *  stockAfter.ts's "unlisted"/oversold flag elsewhere in the app. */
async function sellableAvailable(): Promise<Map<string, number>> {
  const sellable = new Set((await LocationModel.find({ kind: 'SELLABLE' }).lean()).map((l) => l.code));
  const rows = await SkuStockModel.find().lean();
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!sellable.has(r.locationCode)) continue;
    map.set(r.sku, (map.get(r.sku) ?? 0) + (r.onHand - r.reserved));
  }
  return map;
}

export interface ReplenishmentRow {
  sku: string;
  name: string;
  /** Sellable available (on-hand minus reserved) — NOT raw on-hand. Can go
   *  negative for an oversold pile; that's real, not a bug. */
  available: number;
  avgDailySales: number;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  needsReorder: boolean;
  suggestedQty: number;
  daysOfCover: number | null;
}

/**
 * Replenishment suggestions across all SKUs. For SKUs at/below their reorder point,
 * suggests a production quantity to cover demand through the next lead cycle.
 */
export async function replenishmentSuggestions(velocityDays = 30): Promise<ReplenishmentRow[]> {
  await connectDB();
  const [products, velocity, availableMap, policies] = await Promise.all([
    ProductModel.find({ active: true }).lean(),
    salesVelocity(velocityDays),
    sellableAvailable(),
    ReorderPolicyModel.find().lean(),
  ]);
  const policyBySku = new Map(policies.map((p) => [p.sku, p]));

  const rows: ReplenishmentRow[] = products.map((p) => {
    const policy = policyBySku.get(p.sku);
    const leadTimeDays = policy?.leadTimeDays ?? DEFAULT_LEAD_DAYS;
    const safetyStock = policy?.safetyStock ?? DEFAULT_SAFETY;
    const avgDailySales = velocity.get(p.sku) ?? 0;
    const available = availableMap.get(p.sku) ?? 0;

    const reorderPoint = Math.ceil(avgDailySales * leadTimeDays + safetyStock);
    const needsReorder = available <= reorderPoint && (avgDailySales > 0 || safetyStock > 0);

    // Produce enough to reach reorderPoint plus one more lead cycle of demand.
    const target = reorderPoint + Math.ceil(avgDailySales * leadTimeDays);
    const suggestedQty = needsReorder ? Math.max(0, target - available) : 0;
    const daysOfCover = avgDailySales > 0 ? Math.round(available / avgDailySales) : null;

    return {
      sku: p.sku,
      name: p.name,
      available,
      avgDailySales: Math.round(avgDailySales * 100) / 100,
      leadTimeDays,
      safetyStock,
      reorderPoint,
      needsReorder,
      suggestedQty,
      daysOfCover,
    };
  });

  // Most urgent first (lowest days of cover among those needing reorder).
  rows.sort((a, b) => {
    if (a.needsReorder !== b.needsReorder) return a.needsReorder ? -1 : 1;
    return (a.daysOfCover ?? 9999) - (b.daysOfCover ?? 9999);
  });
  return rows;
}

export async function setReorderPolicy(sku: string, safetyStock: number, leadTimeDays: number) {
  await connectDB();
  const s = sku.trim().toUpperCase();
  await ReorderPolicyModel.updateOne(
    { sku: s },
    { $set: { safetyStock, leadTimeDays, active: true } },
    { upsert: true },
  );
}
