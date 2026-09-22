/**
 * One-off: given a list of tracking / AWB numbers (the ones cross-checked
 * against Myntra's SPF claims and currently graded GOOD), change their
 * RETURNED StockMovement condition to WRONG — via editEntry() so it goes
 * through the exact same transactional path the "Edit return" dialog uses.
 * Unlike GOOD->FAKED, GOOD->WRONG actually MOVES the quantity out of MAIN
 * (sellable) into DAMAGED (not sellable) — editEntry() handles that location
 * transfer correctly, a raw field update would not.
 *
 * Non-GOOD matches and tracking numbers with no RETURNED row at all are
 * reported but left untouched (skipped).
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/mark-tracking-wrong.ts --dry
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/mark-tracking-wrong.ts
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
MYSR1245353954
MYER1070232746
MYER1070238600
MYER1068452734
MYER1069102813
MYER1069373140
MYER1069006357
MYER1069058240
MYER1069044029
MYER1068819097
MYER1068883889
MYER1069023519
MYER1068997838
MYER1068866877
MYER1068687144
MYER1068372799
MYER1068015675
MYER1067943959
MYER1068627563
MYER1068616883
MYER1068508045
MYER1068511827
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

  console.log(`GOOD -> WRONG (${toUpdate.length}):`);
  for (const r of toUpdate) {
    console.log(`  ${r.trackingId!.padEnd(16)} ${r.sku.padEnd(22)} ${nameFor.get(r.sku) ?? ''}`);
  }

  console.log(`\nAlready graded something else, left as-is (${alreadyOther.length}):`);
  for (const r of alreadyOther) {
    console.log(`  ${r.trackingId!.padEnd(16)} ${r.sku.padEnd(22)} condition=${r.condition}`);
  }

  console.log(`\nNo RETURNED row found at all, skipped (${missing.length}):`);
  for (const id of missing) console.log(`  ${id}`);

  if (DRY) {
    console.log('\nDRY RUN — nothing was written.');
    await mongoose.disconnect();
    return;
  }

  const succeeded: string[] = [];
  const failed: { trackingId: string; error: string }[] = [];
  for (const r of toUpdate) {
    try {
      await editEntry(String(r._id), { condition: 'WRONG' });
      succeeded.push(r.trackingId!);
    } catch (err) {
      failed.push({ trackingId: r.trackingId!, error: err instanceof Error ? err.message : String(err) });
    }
  }
  console.log(`\nUpdated ${succeeded.length} row(s) to WRONG (moved MAIN -> DAMAGED).`);
  if (failed.length) {
    console.log(`\nFAILED (${failed.length}) — left as GOOD, units no longer where this row expects:`);
    for (const f of failed) console.log(`  ${f.trackingId.padEnd(16)} ${f.error}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
