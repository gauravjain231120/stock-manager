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

// ---------------------------------------------------------------------------
// Holidays — array of "YYYY-MM-DD" strings stored under _id: "myntra_holidays"
// ---------------------------------------------------------------------------

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export async function getMyntraHolidays(): Promise<string[]> {
  await connectDB();
  const doc = await SettingModel.findById("myntra_holidays").lean();
  if (doc && Array.isArray(doc.value)) {
    const today = todayIST();
    const active = doc.value.filter((d) => typeof d === "string" && d >= today).sort();
    if (active.length !== doc.value.length) {
      SettingModel.findByIdAndUpdate("myntra_holidays", { value: active }).catch(() => {});
    }
    return active;
  }
  return [];
}

export async function setMyntraHolidays(dates: string[]): Promise<string[]> {
  await connectDB();
  const today = todayIST();
  const clean = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today))].sort();
  await SettingModel.findByIdAndUpdate(
    "myntra_holidays",
    { value: clean, updatedBy: "UI", updatedAt: new Date() },
    { upsert: true },
  );
  return clean;
}

export async function toggleMyntraHoliday(date: string): Promise<string[]> {
  const current = await getMyntraHolidays();
  const idx = current.indexOf(date);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(date);
  }
  return setMyntraHolidays(current);
}

// ---------------------------------------------------------------------------
// Ship-by date calculation (holiday-aware)
// ---------------------------------------------------------------------------

export function skipHolidays(dayStr: string, holidays: string[]): string {
  if (!holidays.length) return dayStr;
  const set = new Set(holidays);
  let [y, m, d] = dayStr.split("-").map(Number);
  for (let i = 0; i < 60 && set.has(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`); i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function myntraShipByDate(
  orderDate: Date | string,
  cutoffTime: string = DEFAULT_MYNTRA_RTD_CUTOFF,
  holidays: string[] = [],
): Date {
  const ms = typeof orderDate === "string" ? new Date(orderDate).getTime() : orderDate.getTime();
  const shifted = new Date(ms + IST_OFFSET_MS);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const [cutoffH, cutoffM] = (cutoffTime || DEFAULT_MYNTRA_RTD_CUTOFF).split(":").map(Number);
  const orderMins = hour * 60 + minute;
  const cutoffMins = (cutoffH ?? 13) * 60 + (cutoffM || 0);
  const dayOffset = orderMins < cutoffMins ? 0 : 1;

  const rawDate = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + dayOffset,
  ));
  const rawKey = `${rawDate.getUTCFullYear()}-${String(rawDate.getUTCMonth() + 1).padStart(2, "0")}-${String(rawDate.getUTCDate()).padStart(2, "0")}`;

  const finalKey = skipHolidays(rawKey, holidays);
  const [fy, fm, fd] = finalKey.split("-").map(Number);

  const shipByIstEndOfDay = Date.UTC(fy, fm - 1, fd, 23, 59, 59, 999);
  return new Date(shipByIstEndOfDay - IST_OFFSET_MS);
}

// ---------------------------------------------------------------------------
// Cutoff update (recalculates pending ship-by dates, now also holiday-aware)
// ---------------------------------------------------------------------------

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

  await recalcPendingMyntraShipBy(cutoffTime);
  return cutoffTime;
}

export async function recalcPendingMyntraShipBy(cutoffTime?: string): Promise<void> {
  try {
    await connectDB();
    const cutoff = cutoffTime || await getMyntraRtdCutoff();
    const holidays = await getMyntraHolidays();
    const pendingMyntra = await PendingShipmentModel.find({
      channel: "MYNTRA",
    });
    for (const p of pendingMyntra) {
      const orderDate = p.placedAt || (p as any).createdAt;
      if (orderDate) {
        const newShipBy = myntraShipByDate(orderDate, cutoff, holidays);
        await PendingShipmentModel.updateOne({ _id: p._id }, { $set: { shipByAt: newShipBy } });
      }
    }
  } catch (err: any) {
    console.error("Failed to update pending Myntra shipBy dates:", err.message);
  }
}
