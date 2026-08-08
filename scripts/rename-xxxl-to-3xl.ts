/**
 * One-off: rename every XXXL variant to 3XL, because that is what the Amazon
 * listings call it — and the marketplace is what sends the SKU when an order
 * lands, so its spelling has to win or the order matches nothing.
 *
 * Only Co-ord Set (RRC-001) and V-Neck Kurti (RRC-013) ever had XXXL, and they
 * must move together: V-Neck Kurti draws its stock from the matching Co-ord Set
 * SKU, so renaming one side alone would leave 3XL pointing at nothing.
 *
 * renameVariantSku carries stock, ledger history and channel mappings across.
 * This also fixes up the size attribute, the display name and the group's size
 * list, which the rename itself doesn't touch.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/rename-xxxl-to-3xl.ts --dry
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/rename-xxxl-to-3xl.ts
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { renameVariantSku } from '@/lib/products';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';
import { SkuStockModel } from '@/models/SkuStock';
import { StockMovementModel } from '@/models/StockMovement';

config({ path: '.env.local' });

const DRY = process.argv.includes('--dry');
const OLD = 'XXXL';
const NEW = '3XL';

async function main() {
  await connectDB();
  console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== APPLYING ===\n');

  const victims = await ProductModel.find({ sku: new RegExp(`-${OLD}$`) }).sort({ sku: 1 });
  console.log(`${victims.length} SKUs ending -${OLD}\n`);

  for (const p of victims) {
    const oldSku = p.sku;
    const newSku = oldSku.slice(0, -OLD.length) + NEW;

    // Everything that has to move with the SKU, counted so we can prove it did.
    const [stock, movements] = await Promise.all([
      SkuStockModel.find({ sku: oldSku }).lean(),
      StockMovementModel.countDocuments({ sku: oldSku }),
    ]);
    const onHand = stock.reduce((a, s) => a + s.onHand, 0);
    console.log(`  ${oldSku.padEnd(24)} -> ${newSku.padEnd(22)} stock=${onHand} rows=${stock.length} ledger=${movements}`);

    if (DRY) continue;

    await renameVariantSku(oldSku, newSku);
    // renameVariantSku moves the SKU and its stock/history; the variant's own
    // size attribute and name still say XXXL.
    const fresh = await ProductModel.findOne({ sku: newSku });
    if (fresh) {
      fresh.attributes?.set('size', NEW);
      fresh.name = fresh.name.replace(new RegExp(`\\b${OLD}$`), NEW);
      await fresh.save();
    }
  }

  console.log('\ngroup size lists:');
  const groups = await ProductGroupModel.find({ sizes: OLD });
  for (const g of groups) {
    console.log(`  ${g.code.padEnd(12)} [${g.sizes.join(', ')}] -> [${g.sizes.map((s) => (s === OLD ? NEW : s)).join(', ')}]`);
    if (DRY) continue;
    g.sizes = g.sizes.map((s) => (s === OLD ? NEW : s));
    await g.save();
  }

  if (DRY) console.log('\nDRY RUN — nothing was written.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
