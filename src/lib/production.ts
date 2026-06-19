import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { postMovement } from '@/lib/stock';
import { MovementType, SystemLocation } from '@/lib/constants';
import { RawMaterialModel } from '@/models/RawMaterial';
import { RawMaterialMovementModel, RawMovementType } from '@/models/RawMaterialMovement';
import { BomModel } from '@/models/Bom';
import { ProductionBatchModel } from '@/models/ProductionBatch';

export class InsufficientMaterialError extends Error {
  constructor(materialCode: string, need: number, have: number) {
    super(`Not enough raw material ${materialCode}: need ${need}, have ${have}`);
    this.name = 'InsufficientMaterialError';
  }
}

function norm(s: string) {
  return s.trim().toUpperCase();
}

/** Receive raw material from a supplier (+onHand, PURCHASED ledger row). */
export async function receiveRawMaterial(args: {
  materialCode: string;
  qty: number;
  note?: string;
  refId?: string;
}) {
  if (args.qty <= 0) throw new Error('receiveRawMaterial qty must be positive');
  await connectDB();
  const code = norm(args.materialCode);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const mat = await RawMaterialModel.findOneAndUpdate(
        { code },
        { $inc: { onHand: args.qty } },
        { session, returnDocument: 'after' },
      );
      if (!mat) throw new Error(`Unknown raw material ${code}`);
      await RawMaterialMovementModel.create(
        [{ materialCode: code, qty: args.qty, type: RawMovementType.PURCHASED, refType: 'PURCHASE', refId: args.refId, note: args.note }],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Create a production batch: consume raw materials per the SKU's BOM and produce
 * `qty` finished units — atomically. If any material is short, the whole batch is
 * refused and nothing changes.
 */
export async function createProductionBatch(args: {
  sku: string;
  qty: number;
  locationCode?: string;
  note?: string;
}) {
  if (args.qty <= 0) throw new Error('production qty must be positive');
  await connectDB();
  const sku = norm(args.sku);
  const locationCode = norm(args.locationCode ?? SystemLocation.MAIN);

  const bom = await BomModel.findOne({ sku }).lean();
  const required = (bom?.components ?? []).map((c) => ({
    materialCode: c.materialCode,
    qty: c.qtyPerUnit * args.qty,
  }));

  const session = await mongoose.startSession();
  let batchId: mongoose.Types.ObjectId | undefined;
  try {
    await session.withTransaction(async () => {
      // Create the batch first so its id can tag every movement.
      const [batch] = await ProductionBatchModel.create(
        [{ sku, qty: args.qty, locationCode, materialsConsumed: required, note: args.note }],
        { session },
      );
      batchId = batch._id;
      const refId = String(batch._id);

      // Consume each material with an atomic guard (refuse if short).
      for (const r of required) {
        if (r.qty <= 0) continue;
        const code = norm(r.materialCode);
        const mat = await RawMaterialModel.findOneAndUpdate(
          { code, onHand: { $gte: r.qty } },
          { $inc: { onHand: -r.qty } },
          { session, returnDocument: 'after' },
        );
        if (!mat) {
          const have = (await RawMaterialModel.findOne({ code }).session(session))?.onHand ?? 0;
          throw new InsufficientMaterialError(code, r.qty, have);
        }
        await RawMaterialMovementModel.create(
          [{ materialCode: code, qty: -r.qty, type: RawMovementType.CONSUMED, refType: 'PRODUCTION', refId, note: `Batch of ${args.qty} x ${sku}` }],
          { session },
        );
      }

      // Produce finished goods.
      await postMovement(session, {
        sku,
        locationCode,
        qty: args.qty,
        type: MovementType.PRODUCED,
        refType: 'PRODUCTION',
        refId,
        note: args.note,
      });
    });
    return batchId!;
  } finally {
    await session.endSession();
  }
}

/** Raw materials at or below their reorder point. */
export async function lowRawMaterials() {
  await connectDB();
  return RawMaterialModel.find({ $expr: { $lte: ['$onHand', '$reorderPoint'] }, active: true })
    .sort({ code: 1 })
    .lean();
}

export async function listRawMaterials() {
  await connectDB();
  return RawMaterialModel.find().sort({ code: 1 }).lean();
}

export async function listProductionBatches(limit = 50) {
  await connectDB();
  return ProductionBatchModel.find().sort({ createdAt: -1 }).limit(limit).lean();
}
