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
/**
 * Tracking numbers already saved on another report. A number belongs to exactly
 * one report, so these are dropped rather than duplicated.
 * `exceptId` lets a report keep its own numbers while being edited.
 */
async function findDuplicates(codes: string[], exceptId?: string) {
  const clash = await ReturnReportModel.find(
    { 'items.trackingId': { $in: codes }, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { platform: 1, reportDate: 1, items: 1 },
  ).lean();

  const dupes = new Map<string, string>(); // trackingId -> where it already lives
  for (const rep of clash) {
    const where = `${rep.platform ?? 'report'} ${(rep.reportDate as unknown as Date).toISOString().slice(0, 10)}`;
    for (const it of rep.items) {
      if (codes.includes(it.trackingId)) dupes.set(it.trackingId, where);
    }
  }
  return dupes;
}

export async function createReturnReport(input: { platform?: string; date?: Date; text: string }) {
  await connectDB();
  const { codes, skipped } = parseTrackingList(input.text);
  if (codes.length === 0) throw new Error('No usable tracking numbers found — paste one per line.');

  const dupes = await findDuplicates(codes);
  const fresh = codes.filter((c) => !dupes.has(c));
  if (fresh.length === 0) {
    throw new Error(`Every one of those tracking numbers is already on another report (e.g. ${[...dupes.values()][0]}).`);
  }

  const platform = PLATFORMS.includes(input.platform as Platform) ? (input.platform as Platform) : undefined;
  const doc = await ReturnReportModel.create({
    platform,
    reportDate: input.date ?? new Date(),
    items: fresh.map((trackingId) => ({ trackingId })),
  });
  return {
    id: String(doc._id),
    added: fresh.length,
    skipped,
    duplicates: [...dupes.entries()].map(([trackingId, where]) => ({ trackingId, where })),
  };
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

/** Split pasted text into clean, unique tracking numbers, flagging over-long ones. */
function parseTrackingList(text: string): { codes: string[]; skipped: string[] } {
  const seen = new Set<string>();
  const skipped: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw.trim()) continue;
    const v = normalizeTracking(raw);
    if (!v) continue;
    if (v.length > MAX_TRACKING_LEN) { skipped.push(raw.trim()); continue; }
    seen.add(v);
  }
  return { codes: [...seen], skipped };
}

/**
 * Rewrite a report — add numbers, fix a mistyped one, drop a line, or change the
 * platform/date. Lines already marked claimed keep that flag if they survive.
 */
export async function updateReturnReport(
  id: string,
  changes: { platform?: string; date?: Date; text?: string },
) {
  await connectDB();
  const rep = await ReturnReportModel.findById(id).lean();
  if (!rep) throw new Error('Report not found');

  const set: Record<string, unknown> = {};
  let skipped: string[] = [];
  let total = rep.items.length;

  let duplicates: { trackingId: string; where: string }[] = [];
  if (changes.text !== undefined) {
    const parsed = parseTrackingList(changes.text);
    if (parsed.codes.length === 0) throw new Error('No usable tracking numbers found — paste one per line.');

    // A number already on a DIFFERENT report can't be added here.
    const dupes = await findDuplicates(parsed.codes, id);
    const fresh = parsed.codes.filter((c) => !dupes.has(c));
    if (fresh.length === 0) {
      throw new Error(`Every one of those tracking numbers is already on another report (e.g. ${[...dupes.values()][0]}).`);
    }
    duplicates = [...dupes.entries()].map(([trackingId, where]) => ({ trackingId, where }));

    const before = new Map(rep.items.map((i) => [i.trackingId, i]));
    set.items = fresh.map((trackingId) => ({
      trackingId,
      settled: before.get(trackingId)?.settled ?? false,
      note: before.get(trackingId)?.note ?? undefined,
    }));
    skipped = parsed.skipped;
    total = fresh.length;
  }
  if (changes.platform !== undefined && PLATFORMS.includes(changes.platform as Platform)) {
    set.platform = changes.platform;
  }
  if (changes.date !== undefined) set.reportDate = changes.date;

  if (Object.keys(set).length > 0) await ReturnReportModel.updateOne({ _id: id }, { $set: set });
  return { ok: true, total, skipped, duplicates };
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
