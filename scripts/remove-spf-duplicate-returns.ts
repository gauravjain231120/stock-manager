/**
 * One-off (2026-09-23): undo 3 duplicate WRONG returns added by
 * scripts/fix-spf-paid-grades.ts. Those paid SPF claims looked unlogged
 * because Myntra's claim data had no return tracking id for them, but each
 * return was already logged under its RETURN tracking id — same SKU, WRONG,
 * DAMAGED, same day. The duplicates were logged under the original shipment
 * tracking id instead.
 *
 * For each duplicate: checks it's still exactly that row and that the
 * original is still there, deletes it via deleteEntry() (reverses the +1 in
 * DAMAGED, same path as the Stock Log's Delete), then pulls its tracking id
 * from the Myntra return report recordEntry() auto-added it to.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/remove-spf-duplicate-returns.ts --dry
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/remove-spf-duplicate-returns.ts
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { MovementType } from '@/lib/constants';
import { deleteEntry } from '@/lib/register';
import { StockMovementModel } from '@/models/StockMovement';
import { ReturnReportModel } from '@/models/ReturnReport';

config({ path: '.env.local' });

const DRY = process.argv.includes('--dry');

const DUPLICATES = [
  { id: '6ab36f4ba9301833c19afe3c', trackingId: 'MYEP1128530940', sku: 'RRC-007-CO-C-RED-M', original: 'MYER1067689957' },
  { id: '6ab36f4ba9301833c19afe3b', trackingId: 'MYEC1113919146', sku: 'RRC-012-CO-C-RED-S', original: 'MYER1068614533' },
  { id: '6ab36f4ca9301833c19afe3d', trackingId: 'MYEC1114178495', sku: 'RRC-012-CO-B-BL-XXL', original: 'MYER1068511711' },
];

async function main() {
  await connectDB();
  console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== APPLYING ===\n');

  const ok: typeof DUPLICATES = [];
  for (const d of DUPLICATES) {
    const mv = await StockMovementModel.findById(d.id).lean();
    const original = await StockMovementModel.findOne({
      type: MovementType.RETURNED,
      trackingId: d.original,
      sku: d.sku,
      condition: 'WRONG',
    }).lean();
    const problem = !mv
      ? 'row not found (already removed?)'
      : mv.type !== MovementType.RETURNED || mv.trackingId !== d.trackingId || mv.sku !== d.sku || mv.condition !== 'WRONG' || mv.locationCode !== 'DAMAGED'
        ? `row changed: ${mv.type} ${mv.trackingId} ${mv.sku} ${mv.condition} ${mv.locationCode}`
        : !original
          ? `original ${d.original} not found — not a duplicate any more, keeping it`
          : null;
    const reports = await ReturnReportModel.find({ 'items.trackingId': d.trackingId }, { reportDate: 1 }).lean();
    console.log(
      `  ${d.trackingId.padEnd(16)} ${d.sku.padEnd(22)} ${problem ? `SKIP — ${problem}` : `delete (duplicate of ${d.original})`}` +
        `; in ${reports.length} report(s)`,
    );
    if (!problem) ok.push(d);
  }

  if (DRY) {
    console.log('\nDRY RUN — nothing was written.');
    await mongoose.disconnect();
    return;
  }

  for (const d of ok) {
    await deleteEntry(d.id);
    const pulled = await ReturnReportModel.updateMany({ 'items.trackingId': d.trackingId }, { $pull: { items: { trackingId: d.trackingId } } });
    console.log(`  removed ${d.trackingId} (report entries pulled: ${pulled.modifiedCount})`);
  }
  console.log(`\nDone: ${ok.length} duplicate(s) removed.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
