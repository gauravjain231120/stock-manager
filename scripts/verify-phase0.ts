/**
 * Phase 0 acceptance test. Proves the foundation is correct:
 *   1. PRODUCED adds to stock
 *   2. SOLD subtracts
 *   3. the anti-oversell guard refuses to go below available
 *   4. the SkuStock cache stays exactly in sync with the immutable ledger
 *   5. made/sold totals come straight from the ledger
 *
 * Uses a throwaway SKU and cleans up after itself, so it's safe to re-run.
 *
 * Run:  npm run verify
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { StockMovementModel } from '@/models/StockMovement';
import { SkuStockModel } from '@/models/SkuStock';
import {
  applyMovement,
  sellUnits,
  getStock,
  reconcileFromLedger,
  movementSummary,
  InsufficientStockError,
} from '@/lib/stock';
import { MovementType } from '@/lib/constants';
import { ensureSystemLocations } from './setup-locations';

config({ path: '.env.local' });

const SKU = 'TEST-VERIFY-SKU';
const LOC = 'MAIN';

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`);
  }
}

async function cleanup() {
  await ProductModel.deleteOne({ sku: SKU });
  await StockMovementModel.deleteMany({ sku: SKU });
  await SkuStockModel.deleteMany({ sku: SKU });
}

async function main() {
  await connectDB();
  await ensureSystemLocations();
  await cleanup(); // start clean

  await ProductModel.create({ sku: SKU, name: 'Verification Product' });

  // 1. Produce 100
  await applyMovement({ sku: SKU, locationCode: LOC, qty: 100, type: MovementType.PRODUCED });
  let s = await getStock(SKU, LOC);
  check('PRODUCED 100 -> onHand 100', s.onHand === 100, `onHand=${s.onHand}`);

  // 2. Sell 3
  await sellUnits({ sku: SKU, locationCode: LOC, qty: 3, refType: 'TEST', refId: 'order-1' });
  s = await getStock(SKU, LOC);
  check('SOLD 3 -> onHand 97', s.onHand === 97, `onHand=${s.onHand}`);

  // 3. Anti-oversell: try to sell more than available
  let blocked = false;
  try {
    await sellUnits({ sku: SKU, locationCode: LOC, qty: 1000 });
  } catch (e) {
    blocked = e instanceof InsufficientStockError;
  }
  check('Oversell of 1000 is REFUSED', blocked);
  s = await getStock(SKU, LOC);
  check('onHand unchanged after refused oversell (97)', s.onHand === 97, `onHand=${s.onHand}`);

  // 4. Cache matches the ledger
  const recon = await reconcileFromLedger();
  const mine = recon.rows.find((r) => r.sku === SKU && r.locationCode === LOC);
  check('Ledger sum == cache for test SKU', !!mine && mine.inSync, JSON.stringify(mine));
  check('Ledger sum == 97', !!mine && mine.ledgerOnHand === 97, `ledger=${mine?.ledgerOnHand}`);

  // 5. Made / Sold report from ledger
  const sum = await movementSummary(SKU);
  check('Report: made == 100', sum.made === 100, `made=${sum.made}`);
  check('Report: sold == 3', sum.sold === 3, `sold=${sum.sold}`);

  await cleanup(); // leave no trace

  console.log(`\nPhase 0 verification: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error('Verification failed');
}

main()
  .then(() => mongoose.connection.close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n' + (err?.message || err));
    process.exit(1);
  });
