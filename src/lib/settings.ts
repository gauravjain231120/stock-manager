import { connectDB } from "@/lib/db";
import { SettingModel } from "@/models/Setting";
import { PendingShipmentModel } from "@/models/PendingShipment";

export const DEFAULT_MYNTRA_RTD_CUTOFF = "13:00"; // 1:00 PM IST
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export async function getMyntraRtdCutoff(): Promise<string> {
  await connectDB();
  const doc = await SettingModel.findById("myntra_rtd").lean();
  if (doc && typeof doc.value === "string") return doc.value;
  if (doc && typeof doc.value?.cutoffTime === "string") return doc.value.cutoffTime;
  return DEFAULT_MYNTRA_RTD_CUTOFF;
}

export function myntraShipByDate(orderDate: Date | string, cutoffTime: string = DEFAULT_MYNTRA_RTD_CUTOFF): Date {
  const ms = typeof orderDate === "string" ? new Date(orderDate).getTime() : orderDate.getTime();
  const shifted = new Date(ms + IST_OFFSET_MS);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const [cutoffH, cutoffM] = (cutoffTime || DEFAULT_MYNTRA_RTD_CUTOFF).split(":").map(Number);
  const orderMins = hour * 60 + minute;
  const cutoffMins = (cutoffH ?? 13) * 60 + (cutoffM || 0);
  const dayOffset = orderMins < cutoffMins ? 0 : 1;
  const shipByIstEndOfDay = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + dayOffset,
    23,
    59,
    59,
    999
  );
  return new Date(shipByIstEndOfDay - IST_OFFSET_MS);
}

export async function setMyntraRtdCutoff(cutoffTime: string, updatedBy?: string): Promise<string> {
  await connectDB();
  await SettingModel.findByIdAndUpdate(
    "myntra_rtd",
    {
      value: { cutoffTime },
      updatedBy: updatedBy || "UI",
      updatedAt: new Date(),
    },
    { upsert: true }
  );

  // Recalculate shipByAt for pending Myntra orders placed in the last 48 hours
  try {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pendingMyntra = await PendingShipmentModel.find({
      channel: "MYNTRA",
      placedAt: { $gte: twoDaysAgo },
    });
    for (const p of pendingMyntra) {
      if (p.placedAt) {
        const newShipBy = myntraShipByDate(p.placedAt, cutoffTime);
        await PendingShipmentModel.updateOne({ _id: p._id }, { $set: { shipByAt: newShipBy } });
      }
    }
  } catch (err: any) {
    console.error("Failed to update pending Myntra shipBy dates:", err.message);
  }

  return cutoffTime;
}
