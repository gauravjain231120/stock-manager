import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { StockMovementModel } from '../src/models/StockMovement';
import { SkuStockModel } from '../src/models/SkuStock';
import { MovementType, SystemLocation } from '../src/lib/constants';

async function main() {
  await connectDB();
  const sku = 'RRC-001-CO-D-BL-L';
  const locationCode = SystemLocation.MAIN;
  const qty = 1;
  const backdate = new Date('2026-07-22T12:00:00.000Z');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1. Decrement cache
      const updated = await SkuStockModel.findOneAndUpdate(
        { sku, locationCode },
        { $inc: { onHand: -qty } },
        { session, new: true, upsert: true }
      );
      
      console.log(`Updated cache: ${updated.onHand} on hand`);

      // 2. Insert backdated movement
      const [mv] = await StockMovementModel.create([{
        sku,
        locationCode,
        qty: -qty,
        type: MovementType.SOLD,
        channel: 'MYNTRA',
        note: 'Backdated entry per request',
        createdAt: backdate
      }], { session });
      
      console.log(`Inserted movement at ${mv.createdAt}`);
    });
    console.log('Done!');
  } finally {
    await session.endSession();
    process.exit(0);
  }
}

main().catch(console.error);
