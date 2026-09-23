/**
 * One-off (2026-09-23): reconcile returns with what Myntra actually paid SPF
 * claims for — the bot's SPF Status page listed these as "Paid claims to
 * check".
 *
 *  1. FAKED: returns currently graded GOOD or USED, but Myntra paid a claim on
 *     them — relabelled FAKED via editEntry() (same path as the Returns page's
 *     "Edit" dialog). GOOD/USED/FAKED all sit in MAIN, so no stock moves.
 *  2. WRONG: paid claims that were never logged as a return here at all —
 *     logged now via recordEntry() (same path as "Log a return"), condition
 *     WRONG (-> DAMAGED, sellable stock untouched), backdated to the day Myntra
 *     delivered the return back (the claim's podDate, IST). Logged under the
 *     original shipment tracking id, since these claims have no return
 *     tracking id. SKU resolved from the claim's own skuId via the packed
 *     order's line item, matched to this catalog.
 *
 * Idempotent: a tracking id already FAKED, or already having a RETURNED row,
 * is reported and skipped.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/fix-spf-paid-grades.ts --dry
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/fix-spf-paid-grades.ts
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { normalizeTracking, MovementType } from '@/lib/constants';
import { editEntry, recordEntry } from '@/lib/register';
import { StockMovementModel } from '@/models/StockMovement';
import { ProductModel } from '@/models/Product';

config({ path: '.env.local' });

const DRY = process.argv.includes('--dry');

const TO_FAKED = [
  'MYER1069044029',
  'MYER1070090577',
  'MYER1070052769',
  'MYER1070035813',
  'MYER1069102813',
  'MYER1068372799',
  'MYEC1115354408',
  'MYEP1132708251',
  'MYER1069058240',
];

// podDate from each paid SPF claim (Myntra shows IST).
const TO_ADD_WRONG = [
  { trackingId: 'MYEC1113919146', sku: 'RRC-012-CO-C-RED-S', date: '2026-08-14T12:40:50+05:30', ticket: 8665701 },
  { trackingId: 'MYEP1128530940', sku: 'RRC-007-CO-C-RED-M', date: '2026-08-05T12:56:19+05:30', ticket: 8472588 },
  { trackingId: 'MYEC1114178495', sku: 'RRC-012-CO-B-BL-XXL', date: '2026-08-14T12:40:50+05:30', ticket: 8665867 },
];

async function main() {
  await connectDB();
  console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== APPLYING ===\n');

  // ---- 1. relabel as FAKED ----
  const fakedIds = TO_FAKED.map((t) => normalizeTracking(t)!);
  const rows = await StockMovementModel.find({ type: MovementType.RETURNED, trackingId: { $in: fakedIds } }).lean();
  const toRelabel: typeof rows = [];
  console.log('GOOD/USED -> FAKED:');
  for (const id of fakedIds) {
    const mine = rows.filter((r) => r.trackingId === id);
    if (mine.length !== 1) {
      console.log(`  ${id.padEnd(16)} SKIP — ${mine.length} RETURNED rows (expected exactly 1)`);
      continue;
    }
    const r = mine[0];
    if (r.condition === 'FAKED') {
      console.log(`  ${id.padEnd(16)} ${r.sku.padEnd(22)} already FAKED, skipped`);
      continue;
    }
    if (r.condition && r.condition !== 'GOOD' && r.condition !== 'USED') {
      console.log(`  ${id.padEnd(16)} ${r.sku.padEnd(22)} SKIP — graded ${r.condition}, not GOOD/USED`);
      continue;
    }
    console.log(`  ${id.padEnd(16)} ${r.sku.padEnd(22)} ${r.condition ?? 'GOOD'} -> FAKED`);
    toRelabel.push(r);
  }

  // ---- 2. add as WRONG ----
  console.log('\nNew returns, WRONG:');
  const toAdd: typeof TO_ADD_WRONG = [];
  for (const w of TO_ADD_WRONG) {
    const id = normalizeTracking(w.trackingId)!;
    const existing = await StockMovementModel.countDocuments({ type: MovementType.RETURNED, trackingId: id });
    const product = await ProductModel.findOne({ sku: w.sku }, { name: 1 }).lean();
    if (existing) {
      console.log(`  ${id.padEnd(16)} SKIP — already has a RETURNED row`);
      continue;
    }
    if (!product) {
      console.log(`  ${id.padEnd(16)} SKIP — SKU ${w.sku} not in catalog`);
      continue;
    }
    console.log(`  ${id.padEnd(16)} ${w.sku.padEnd(22)} ${product.name} — dated ${w.date} (SPF ticket ${w.ticket})`);
    toAdd.push(w);
  }

  if (DRY) {
    console.log('\nDRY RUN — nothing was written.');
    await mongoose.disconnect();
    return;
  }

  for (const r of toRelabel) {
    await editEntry(String(r._id), { condition: 'FAKED' });
    console.log(`  updated ${r.trackingId}`);
  }
  for (const w of toAdd) {
    await recordEntry(w.sku, 'RETURN', 1, 'MYNTRA', new Date(w.date), w.trackingId, 'WRONG');
    console.log(`  added ${w.trackingId}`);
  }
  console.log(`\nDone: ${toRelabel.length} relabelled FAKED, ${toAdd.length} added WRONG.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
