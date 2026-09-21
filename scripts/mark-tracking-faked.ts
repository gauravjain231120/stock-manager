/**
 * One-off: given a list of tracking / AWB numbers, find their RETURNED
 * StockMovement rows and, for whichever of those are currently graded GOOD,
 * change the condition to FAKED — via editEntry() so it goes through the
 * exact same transactional path the "Edit return" dialog uses (same
 * GOOD/USED/FAKED all sit in MAIN, so this never moves stock between
 * locations, only relabels the row).
 *
 * Non-GOOD matches (already USED/FAKED/WRONG/DEFECTIVE) and tracking numbers
 * with no RETURNED row at all are reported but left untouched.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/mark-tracking-faked.ts --dry
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/mark-tracking-faked.ts
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { normalizeTracking, MovementType } from '@/lib/constants';
import { editEntry } from '@/lib/register';
import { StockMovementModel } from '@/models/StockMovement';
import { ProductModel } from '@/models/Product';

config({ path: '.env.local' });

const DRY = process.argv.includes('--dry');

const RAW_TRACKING_IDS = `
MYER1070090577
MYER1070052769
MYER1070216808
MYER1070273260
MYER1069855118
MYER1070284898
MYER1070018844
MYER1069872702
MYER1070061901
MYER1069993233
MYSR1245228513
MYER1070035813
MYER1069290996
MYER1069874548
MYER1069884808
MYER1069615144
MYER1069519679
MYER1069616828
MYER1069487375
MYER1069505817
MYER1068389499
MYER1069298204
MYER1069108508
MYER1069309043
MYER1069121132
MYER1068933721
MYEP1133475468
MYEC1114925713
MYEP1133607088
MYEP1132530153
MYSR1245409739
MYSC1339646872
MYER1070328522
MYSR1245421488
MYER1070175001
MYER1070200444
MYSR1246114813
MYER1069982209
MYSR1245940408
MYER1069678537
MYER1070052227
MYER1070271039
`;

async function main() {
  await connectDB();
  console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== APPLYING ===\n');

  const ids = [...new Set(RAW_TRACKING_IDS.split('\n').map((s) => normalizeTracking(s)).filter((s): s is string => !!s))];
  console.log(`${ids.length} unique tracking numbers given\n`);

  const rows = await StockMovementModel.find({
    type: MovementType.RETURNED,
    trackingId: { $in: ids },
  }).sort({ trackingId: 1 });

  const bySku = [...new Set(rows.map((r) => r.sku))];
  const products = await ProductModel.find({ sku: { $in: bySku } }, { sku: 1, name: 1 }).lean();
  const nameFor = new Map(products.map((p) => [p.sku, p.name]));

  const foundIds = new Set(rows.map((r) => r.trackingId));
  const missing = ids.filter((id) => !foundIds.has(id));

  const toUpdate = rows.filter((r) => r.condition === 'GOOD');
  const alreadyOther = rows.filter((r) => r.condition !== 'GOOD');

  console.log(`GOOD -> FAKED (${toUpdate.length}):`);
  for (const r of toUpdate) {
    console.log(`  ${r.trackingId!.padEnd(16)} ${r.sku.padEnd(22)} ${nameFor.get(r.sku) ?? ''}`);
  }

  console.log(`\nAlready graded something else, left as-is (${alreadyOther.length}):`);
  for (const r of alreadyOther) {
    console.log(`  ${r.trackingId!.padEnd(16)} ${r.sku.padEnd(22)} condition=${r.condition}`);
  }

  console.log(`\nNo RETURNED row found at all (${missing.length}):`);
  for (const id of missing) console.log(`  ${id}`);

  if (DRY) {
    console.log('\nDRY RUN — nothing was written.');
    await mongoose.disconnect();
    return;
  }

  for (const r of toUpdate) {
    await editEntry(String(r._id), { condition: 'FAKED' });
  }
  console.log(`\nUpdated ${toUpdate.length} row(s) to FAKED.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
