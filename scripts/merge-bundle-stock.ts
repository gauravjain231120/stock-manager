/**
 * One-off repair: units stranded on a variant that shares another variant's
 * stock (Products page → "shares stock with"). Linking a variant that
 * already had stock of its own used to leave those units on its own rows,
 * which nothing reads — so Inventory, the ship queue and the order alerts all
 * showed fewer than the ledger says exist. Linking now moves them itself
 * (lib/products.ts rehomeStockAfterLinkChange); this fixes rows left from
 * before that.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/merge-bundle-stock.ts          # report only
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/merge-bundle-stock.ts --apply  # move them
 *
 * Check the shelf first: if someone already set the shared product's stock
 * to a physical count that included these units, applying would count them
 * twice — correct that product's stock instead.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import mongoose from 'mongoose';
import { findStrandedBundleStock, mergeStrandedBundleStock } from '@/lib/products';
import { SkuStockModel } from '@/models/SkuStock';

async function main() {
  const apply = process.argv.includes('--apply');
  const stranded = await findStrandedBundleStock();
  if (!stranded.length) {
    console.log('Nothing stranded — every linked variant\'s own rows are empty.');
    return;
  }
  console.log(`${stranded.length} stranded row(s):`);
  for (const r of stranded) {
    const target = await SkuStockModel.findOne({ sku: r.pool, locationCode: r.locationCode }).lean();
    const now = target?.onHand ?? 0;
    console.log(`  ${r.sku} @ ${r.locationCode}: ${r.onHand} unit(s) -> ${r.pool} (shows ${now} now, ${now + r.onHand} after)`);
  }
  if (!apply) {
    console.log('\nReport only. Re-run with --apply to move them.');
    return;
  }
  const done = await mergeStrandedBundleStock();
  for (const d of done) console.log(`  moved ${d.sku} -> ${d.pool}:`, d.moved.map((m) => `${m.onHand}@${m.locationCode}`).join(', ') || 'nothing');
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
