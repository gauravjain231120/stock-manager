import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';
import { CHANNELS } from '@/lib/constants';

/**
 * A pending fake order/return used by the channel SIMULATOR (dev/testing without
 * real marketplace APIs). The simulator adapter's pullOrders/pullReturns read
 * unconsumed events and mark them consumed. Replace the simulator with real
 * adapters and this collection becomes unused.
 */
const SimulatedEventSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['ORDER', 'RETURN'] },
    channel: { type: String, required: true, enum: CHANNELS },
    payload: { type: Schema.Types.Mixed, required: true },
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

SimulatedEventSchema.index({ channel: 1, kind: 1, consumed: 1, createdAt: 1 });

export type SimulatedEvent = InferSchemaType<typeof SimulatedEventSchema>;

export const SimulatedEventModel: Model<SimulatedEvent> =
  (mongoose.models.SimulatedEvent as Model<SimulatedEvent>) ||
  mongoose.model<SimulatedEvent>('SimulatedEvent', SimulatedEventSchema);
