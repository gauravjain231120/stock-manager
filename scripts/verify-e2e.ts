/**
 * End-to-end test across ALL phases, using the channel simulator (no real APIs):
 *   manufacturing -> list on channels -> sync -> simulate order -> sell -> resync
 *   -> oversell refused -> return -> grade (sellable + damaged) -> replenishment
 *   -> reports -> ledger reconciliation.
 *
 * Self-contained: uses E2E-* throwaway data and cleans up. Safe to re-run.
 *
 * Run:  npm run verify:e2e
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { Channel, SystemLocation } from '@/lib/constants';
import { getStock, reconcileFromLedger } from '@/lib/stock';
import { ensureSystemLocations } from './setup-locations';
import { receiveRawMaterial, createProductionBatch } from '@/lib/production';
import { createProductGroup, getProductGroups } from '@/lib/products';
import { ingestOrders } from '@/lib/orders';
import { ingestReturns, gradeReturn } from '@/lib/returns';
import { syncSkus, publishableQty } from '@/lib/sync';
import { replenishmentSuggestions, setReorderPolicy } from '@/lib/replenishment';
import { reportBundle } from '@/lib/reports';
import { enqueueSimulatedOrder, enqueueSimulatedReturn } from '@/lib/marketplace/simulator';

import { ProductModel } from '@/models/Product';
import { StockMovementModel } from '@/models/StockMovement';
import { SkuStockModel } from '@/models/SkuStock';
import { RawMaterialModel } from '@/models/RawMaterial';
import { RawMaterialMovementModel } from '@/models/RawMaterialMovement';
import { BomModel } from '@/models/Bom';
import { ProductionBatchModel } from '@/models/ProductionBatch';
import { ChannelListingModel } from '@/models/ChannelListing';
import { ChannelInventoryStateModel } from '@/models/ChannelInventoryState';
import { MarketplaceOrderModel } from '@/models/MarketplaceOrder';
import { ReturnRecordModel } from '@/models/ReturnRecord';
import { ReorderPolicyModel } from '@/models/ReorderPolicy';
import { SimulatedEventModel } from '@/models/SimulatedEvent';
import { ProductGroupModel } from '@/models/ProductGroup';

config({ path: '.env.local' });

const SKU = 'E2E-SKU';
const MAT = 'E2E-MAT';
const AMZ = 'E2E-AMZ';
const FLP = 'E2E-FLP';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`); }
}

async function cleanup() {
  await Promise.all([
    ProductModel.deleteOne({ sku: SKU }),
    StockMovementModel.deleteMany({ sku: SKU }),
    SkuStockModel.deleteMany({ sku: SKU }),
    RawMaterialModel.deleteOne({ code: MAT }),
    RawMaterialMovementModel.deleteMany({ materialCode: MAT }),
    BomModel.deleteOne({ sku: SKU }),
    ProductionBatchModel.deleteMany({ sku: SKU }),
    ChannelListingModel.deleteMany({ sku: SKU }),
    ChannelInventoryStateModel.deleteMany({ sku: SKU }),
    MarketplaceOrderModel.deleteMany({ channelOrderId: /^E2E/ }),
    ReturnRecordModel.deleteMany({ channelReturnId: /^E2E/ }),
    ReorderPolicyModel.deleteOne({ sku: SKU }),
    SimulatedEventModel.deleteMany({ $or: [{ 'payload.channelSku': AMZ }, { 'payload.lines.channelSku': AMZ }] }),
    ProductGroupModel.deleteOne({ code: 'E2EGRP' }),
    ProductModel.deleteMany({ sku: /^E2EGRP/ }),
    StockMovementModel.deleteMany({ sku: /^E2EGRP/ }),
    SkuStockModel.deleteMany({ sku: /^E2EGRP/ }),
  ]);
}

async function main() {
  await connectDB();
  await ensureSystemLocations();
  await cleanup();

  // --- Phase 1: manufacturing ---
  await ProductModel.create({ sku: SKU, name: 'E2E Test Product' });
  await RawMaterialModel.create({ code: MAT, name: 'E2E Material', unit: 'pcs', onHand: 0 });
  await receiveRawMaterial({ materialCode: MAT, qty: 1000 });
  await BomModel.create({ sku: SKU, components: [{ materialCode: MAT, qtyPerUnit: 2 }] });

  await createProductionBatch({ sku: SKU, qty: 100 });
  let s = await getStock(SKU, SystemLocation.MAIN);
  check('Produced 100 -> MAIN onHand 100', s.onHand === 100, `onHand=${s.onHand}`);
  const mat = await RawMaterialModel.findOne({ code: MAT }).lean();
  check('BOM consumed 200 material -> 800 left', mat?.onHand === 800, `mat=${mat?.onHand}`);

  // --- Product with size×color variants ---
  const grp = await createProductGroup({
    code: 'E2EGRP', name: 'E2E Variant Product', category: 'Test',
    colors: ['Red'], sizes: ['M', 'L'],
    variants: [{ color: 'Red', size: 'M', openingQty: 7 }, { color: 'Red', size: 'L', openingQty: 3 }],
  });
  check('Product group -> 2 variant SKUs created', grp.created === 2, JSON.stringify(grp));
  const groupsView = (await getProductGroups()).groups.find((g) => g.code === 'E2EGRP');
  check('Group shows 2 variants & 10 units', !!groupsView && groupsView.variantCount === 2 && groupsView.totalStock === 10, JSON.stringify(groupsView));

  // --- Phase 2/3: list on channels ---
  await ChannelListingModel.create([
    { sku: SKU, channel: Channel.AMAZON, channelSku: AMZ, price: 599 },
    { sku: SKU, channel: Channel.FLIPKART, channelSku: FLP, price: 599 },
  ]);

  // --- Phase 4: sync (no buffer) ---
  await syncSkus([SKU]);
  let pub = await publishableQty(SKU);
  check('Publishable == 100 (no buffer)', pub === 100, `pub=${pub}`);
  const amzState1 = await ChannelInventoryStateModel.findOne({ channel: Channel.AMAZON, channelSku: AMZ }).lean();
  check('Amazon channel state published 100', amzState1?.publishedQty === 100, `pub=${amzState1?.publishedQty}`);

  // set a safety buffer of 5 and re-sync
  await SkuStockModel.updateOne({ sku: SKU, locationCode: SystemLocation.MAIN }, { $set: { buffer: 5 } });
  await syncSkus([SKU]);
  pub = await publishableQty(SKU);
  check('Publishable == 95 (buffer 5)', pub === 95, `pub=${pub}`);

  // --- Phase 2/3: simulate + ingest an order ---
  await enqueueSimulatedOrder(Channel.AMAZON, [{ channelSku: AMZ, qty: 3 }], 'E2E-ORD-1');
  const ing = await ingestOrders(Channel.AMAZON);
  check('Order ingested & fulfilled', ing.fulfilled === 1 && ing.needsStock === 0, JSON.stringify(ing));
  s = await getStock(SKU, SystemLocation.MAIN);
  check('After sale of 3 -> onHand 97', s.onHand === 97, `onHand=${s.onHand}`);
  const amzState2 = await ChannelInventoryStateModel.findOne({ channel: Channel.AMAZON, channelSku: AMZ }).lean();
  check('Resync after sale -> Amazon published 92 (97-5)', amzState2?.publishedQty === 92, `pub=${amzState2?.publishedQty}`);
  const flpState = await ChannelInventoryStateModel.findOne({ channel: Channel.FLIPKART, channelSku: FLP }).lean();
  check('Flipkart also resynced to 92', flpState?.publishedQty === 92, `pub=${flpState?.publishedQty}`);

  // --- anti-oversell across the pipeline ---
  await enqueueSimulatedOrder(Channel.AMAZON, [{ channelSku: AMZ, qty: 100000 }], 'E2E-ORD-2');
  const ing2 = await ingestOrders(Channel.AMAZON);
  check('Huge order flagged NEEDS_STOCK (not oversold)', ing2.needsStock === 1 && ing2.fulfilled === 0, JSON.stringify(ing2));
  s = await getStock(SKU, SystemLocation.MAIN);
  check('onHand unchanged after refused oversell (97)', s.onHand === 97, `onHand=${s.onHand}`);

  // --- Phase 5: returns + grading ---
  await enqueueSimulatedReturn(Channel.AMAZON, AMZ, 2, 'Size issue', 'E2E-RET-1');
  await enqueueSimulatedReturn(Channel.AMAZON, AMZ, 1, 'Damaged in transit', 'E2E-RET-2');
  await ingestReturns(Channel.AMAZON);
  s = await getStock(SKU, SystemLocation.QUARANTINE);
  check('2 returns -> QUARANTINE onHand 3', s.onHand === 3, `quar=${s.onHand}`);

  const recs = await ReturnRecordModel.find({ channelReturnId: /^E2E/ }).sort({ channelReturnId: 1 });
  await gradeReturn(String(recs[0]._id), 'SELLABLE'); // RET-1 qty2
  await gradeReturn(String(recs[1]._id), 'DAMAGED'); // RET-2 qty1
  const main = await getStock(SKU, SystemLocation.MAIN);
  const quar = await getStock(SKU, SystemLocation.QUARANTINE);
  const dmg = await getStock(SKU, SystemLocation.DAMAGED);
  check('Grade SELLABLE -> MAIN 99 (97+2)', main.onHand === 99, `main=${main.onHand}`);
  check('Grade DAMAGED -> DAMAGED 1', dmg.onHand === 1, `dmg=${dmg.onHand}`);
  check('QUARANTINE emptied', quar.onHand === 0, `quar=${quar.onHand}`);

  // --- Phase 6: replenishment ---
  await setReorderPolicy(SKU, 200, 7); // high safety stock to force a reorder
  const repl = await replenishmentSuggestions(30);
  const row = repl.find((r) => r.sku === SKU);
  check('Replenishment flags SKU for reorder', !!row && row.needsReorder, JSON.stringify(row));
  check('Suggested production qty > 0', !!row && row.suggestedQty > 0, `qty=${row?.suggestedQty}`);

  // --- Phase 6: reports ---
  const rep = await reportBundle(30);
  check('Report: sold >= 3', rep.totals.sold >= 3, `sold=${rep.totals.sold}`);
  check('Report: returned >= 3', rep.totals.returned >= 3, `returned=${rep.totals.returned}`);
  check(
    'Report: fast movers non-empty & sorted desc',
    rep.fastMovers.length > 0 && rep.fastMovers.every((m, i) => i === 0 || rep.fastMovers[i - 1].sold >= m.sold),
    JSON.stringify(rep.fastMovers),
  );

  // --- integrity: cache == ledger everywhere ---
  const recon = await reconcileFromLedger();
  check('All stock cache rows match the ledger', recon.allInSync, JSON.stringify(recon.rows.filter((r) => !r.inSync)));

  await cleanup();
  console.log(`\nEnd-to-end verification: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error('E2E verification failed');
}

main()
  .then(() => mongoose.connection.close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n' + (err?.stack || err?.message || err));
    process.exit(1);
  });
