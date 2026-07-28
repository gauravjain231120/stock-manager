import { connectDB } from '@/lib/db';
import { MovementType, PLATFORMS, Platform, normalizeTracking, MAX_TRACKING_LEN } from '@/lib/constants';
import { ProductModel } from '@/models/Product';
import { ReturnReportModel } from '@/models/ReturnReport';
import { StockMovementModel } from '@/models/StockMovement';

/** Below this length a partial match would be meaningless, so only exact counts. */
const MIN_PARTIAL_LEN = 8;

export interface ReportLine {
  trackingId: string;
  received: boolean;
  /** True when it matched a longer/shorter logged number rather than exactly. */
  partial: boolean;
  settled: boolean;
  note: string | null;
  /** Details of the matching return, when there is one. */
  sku: string | null;
  name: string | null;
  qty: number | null;
  loggedAt: string | null;
}

export interface ReportView {
  id: string;
  platform: string | null;
  reportDate: string;
  total: number;
  received: number;
  missing: number;
  settled: number;
  lines: ReportLine[];
}

/**
 * Save a report: the tracking numbers a platform says are coming back.
 * Numbers are normalised the same way as scans, blanks and duplicates dropped,
 * and anything longer than the tracking limit is reported back as skipped.
 */
export async function createReturnReport(input: { platform?: string; date?: Date; text: string }) {
  await connectDB();
  const seen = new Set<string>();
  const skipped: string[] = [];
  for (const raw of input.text.split(/[\s,;]+/)) {
    if (!raw.trim()) continue;
    const v = normalizeTracking(raw);
    if (!v) continue;
    if (v.length > MAX_TRACKING_LEN) { skipped.push(raw.trim()); continue; }
    seen.add(v);
  }
  if (seen.size === 0) throw new Error('No usable tracking numbers found — paste one per line.');

  const platform = PLATFORMS.includes(input.platform as Platform) ? (input.platform as Platform) : undefined;
  const doc = await ReturnReportModel.create({
    platform,
    reportDate: input.date ?? new Date(),
    items: [...seen].map((trackingId) => ({ trackingId })),
  });
  return { id: String(doc._id), added: seen.size, skipped };
}

/** Every saved report, newest first, with each line matched against real returns. */
export async function listReturnReports(): Promise<ReportView[]> {
  await connectDB();
  const reports = await ReturnReportModel.find().sort({ reportDate: -1, createdAt: -1 }).lean();
  if (reports.length === 0) return [];

  // All returns that carry a tracking number — matched on ANY date, because a
  // parcel listed today may only reach us next week.
  const returns = await StockMovementModel.find(
    { type: MovementType.RETURNED, trackingId: { $nin: [null, ''] } },
    { sku: 1, qty: 1, trackingId: 1, createdAt: 1 },
  ).sort({ createdAt: -1 }).lean();

  const byTracking = new Map(returns.map((r) => [r.trackingId as string, r]));
  const skus = [...new Set(returns.map((r) => r.sku))];
  const products = await ProductModel.find({ sku: { $in: skus } }, { sku: 1, name: 1 }).lean();
  const nameBy = new Map(products.map((p) => [p.sku, p.name]));

  /** Exact match first; then tolerate a scan that captured extra characters. */
  const findMatch = (code: string) => {
    const exact = byTracking.get(code);
    if (exact) return { hit: exact, partial: false };
    if (code.length < MIN_PARTIAL_LEN) return null;
    for (const r of returns) {
      const t = r.trackingId as string;
      if (t.length >= MIN_PARTIAL_LEN && (t.startsWith(code) || code.startsWith(t))) {
        return { hit: r, partial: true };
      }
    }
    return null;
  };

  return reports.map((rep) => {
    const lines: ReportLine[] = rep.items.map((it) => {
      const m = findMatch(it.trackingId);
      return {
        trackingId: it.trackingId,
        received: Boolean(m),
        partial: Boolean(m?.partial),
        settled: Boolean(it.settled),
        note: it.note ?? null,
        sku: m ? m.hit.sku : null,
        name: m ? nameBy.get(m.hit.sku) ?? m.hit.sku : null,
        qty: m ? Math.abs(m.hit.qty) : null,
        loggedAt: m ? (m.hit.createdAt as unknown as Date).toISOString() : null,
      };
    });
    const received = lines.filter((l) => l.received).length;
    const settled = lines.filter((l) => !l.received && l.settled).length;
    return {
      id: String(rep._id),
      platform: rep.platform ?? null,
      reportDate: (rep.reportDate as unknown as Date).toISOString(),
      total: lines.length,
      received,
      missing: lines.length - received - settled,
      settled,
      lines,
    };
  });
}

/** Mark a never-arrived parcel as claimed/written off (or put it back to outstanding). */
export async function setReportItemSettled(reportId: string, trackingId: string, settled: boolean) {
  await connectDB();
  const res = await ReturnReportModel.updateOne(
    { _id: reportId, 'items.trackingId': trackingId },
    { $set: { 'items.$.settled': settled } },
  );
  if (res.matchedCount === 0) throw new Error('Line not found');
  return { ok: true };
}

export async function deleteReturnReport(id: string) {
  await connectDB();
  await ReturnReportModel.deleteOne({ _id: id });
  return { ok: true };
}
