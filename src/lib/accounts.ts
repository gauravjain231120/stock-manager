import { connectDB } from '@/lib/db';
import { AccountPeriodModel } from '@/models/AccountPeriod';
import { AccountEntryModel } from '@/models/AccountEntry';

export type EntryType = 'EXPENSE' | 'RECEIVED';

export interface AccountEntryItem {
  id: string;
  periodId: string;
  type: EntryType;
  name: string;
  date: string;
  amount: number;
}

export interface AccountPeriodItem {
  id: string;
  startDate: string;
  endDate: string | null;
  status: 'OPEN' | 'CLOSED';
}

export interface PeriodTotals {
  expense: number;
  received: number;
  net: number;
}

export interface PeriodWithEntries {
  period: AccountPeriodItem;
  entries: AccountEntryItem[];
  totals: PeriodTotals;
  /** The actual earliest/latest entry date in this period — what's meaningful
   *  to show as its range, not necessarily when the period record itself was
   *  opened/closed. `to` is null while still open. */
  from: string;
  to: string | null;
}

export interface ClosedPeriodSummary extends AccountPeriodItem {
  totals: PeriodTotals;
  from: string;
  to: string;
}

function toPeriodItem(doc: { _id: unknown; startDate: Date; endDate?: Date | null; status: string }): AccountPeriodItem {
  return {
    id: String(doc._id),
    startDate: doc.startDate.toISOString(),
    endDate: doc.endDate ? doc.endDate.toISOString() : null,
    status: doc.status as 'OPEN' | 'CLOSED',
  };
}

function toEntryItem(doc: {
  _id: unknown;
  periodId: string;
  type: string;
  name: string;
  date: Date;
  amount: number;
}): AccountEntryItem {
  return {
    id: String(doc._id),
    periodId: doc.periodId,
    type: doc.type as EntryType,
    name: doc.name,
    date: doc.date.toISOString(),
    amount: doc.amount,
  };
}

function computeTotals(entries: { type: EntryType; amount: number }[]): PeriodTotals {
  const expense = entries.filter((e) => e.type === 'EXPENSE').reduce((a, e) => a + e.amount, 0);
  const received = entries.filter((e) => e.type === 'RECEIVED').reduce((a, e) => a + e.amount, 0);
  return { expense, received, net: received - expense };
}

/**
 * The date range a period actually covers, per its entries — falls back to
 * the period's own start/end only when it has no entries at all (nothing
 * else to go by). `to` is null for an open period regardless of entries,
 * since "ongoing" has no end yet.
 */
function periodRange(entries: { date: string }[], period: AccountPeriodItem): { from: string; to: string | null } {
  const dates = entries.map((e) => e.date).sort();
  const from = dates[0] ?? period.startDate;
  if (period.status !== 'CLOSED') return { from, to: null };
  const to = dates[dates.length - 1] ?? period.endDate ?? period.startDate;
  return { from, to };
}

/** The single open period, creating one (starting today) the first time this ever runs. */
export async function ensureOpenPeriod(): Promise<AccountPeriodItem> {
  await connectDB();
  let doc = await AccountPeriodModel.findOne({ status: 'OPEN' });
  if (!doc) {
    doc = await AccountPeriodModel.create({ startDate: new Date(), status: 'OPEN' });
  }
  return toPeriodItem(doc.toObject());
}

export async function listEntries(periodId: string): Promise<AccountEntryItem[]> {
  await connectDB();
  const docs = await AccountEntryModel.find({ periodId }).sort({ date: -1, createdAt: -1 }).lean();
  return docs.map(toEntryItem);
}

export async function getOpenPeriodWithEntries(): Promise<PeriodWithEntries> {
  const period = await ensureOpenPeriod();
  const entries = await listEntries(period.id);
  const { from, to } = periodRange(entries, period);
  return { period, entries, totals: computeTotals(entries), from, to };
}

/** One period (open or closed) by id, with its entries — used by the detail/print pages. */
export async function getPeriod(id: string): Promise<PeriodWithEntries | null> {
  await connectDB();
  const doc = await AccountPeriodModel.findById(id).lean();
  if (!doc) return null;
  const period = toPeriodItem(doc);
  const entries = await listEntries(period.id);
  const { from, to } = periodRange(entries, period);
  return { period, entries, totals: computeTotals(entries), from, to };
}

/** Every closed period, most recently ended first, each with its own totals. */
export async function listClosedPeriods(): Promise<ClosedPeriodSummary[]> {
  await connectDB();
  const periods = await AccountPeriodModel.find({ status: 'CLOSED' }).sort({ endDate: -1 }).lean();
  const ids = periods.map((p) => String(p._id));
  const entries = (await AccountEntryModel.find({ periodId: { $in: ids } }).lean()).map(toEntryItem);
  const byPeriod = new Map<string, AccountEntryItem[]>();
  for (const e of entries) {
    const arr = byPeriod.get(e.periodId) ?? [];
    arr.push(e);
    byPeriod.set(e.periodId, arr);
  }
  return periods.map((p) => {
    const item = toPeriodItem(p);
    const periodEntries = byPeriod.get(item.id) ?? [];
    // Every period here is CLOSED, so periodRange always returns a non-null `to`.
    const { from, to } = periodRange(periodEntries, item) as { from: string; to: string };
    return { ...item, totals: computeTotals(periodEntries), from, to };
  });
}

/** Adds an entry to whichever period is currently open (creating one if needed). */
export async function addEntry(input: { type: EntryType; name: string; date: string; amount: number }): Promise<AccountEntryItem> {
  await connectDB();
  const period = await ensureOpenPeriod();
  const doc = await AccountEntryModel.create({
    periodId: period.id,
    type: input.type,
    name: input.name.trim(),
    date: new Date(input.date),
    amount: input.amount,
  });
  return toEntryItem(doc.toObject());
}

/** Edits an entry's fields — allowed regardless of whether its period is open or closed. */
export async function updateEntry(
  id: string,
  changes: { type?: EntryType; name?: string; date?: string; amount?: number },
): Promise<void> {
  await connectDB();
  const set: Record<string, string | number | Date> = {};
  if (changes.type !== undefined) set.type = changes.type;
  if (changes.name !== undefined) set.name = changes.name.trim();
  if (changes.date !== undefined) set.date = new Date(changes.date);
  if (changes.amount !== undefined) set.amount = changes.amount;
  if (Object.keys(set).length === 0) return;
  await AccountEntryModel.updateOne({ _id: id }, { $set: set });
}

/** Deletes an entry — allowed regardless of whether its period is open or closed. */
export async function deleteEntry(id: string): Promise<void> {
  await connectDB();
  await AccountEntryModel.deleteOne({ _id: id });
}

/**
 * Permanently deletes a CLOSED period and every entry in it. Refuses to
 * delete the open period — there must always be exactly one, and deleting
 * "now" makes no sense; clear its entries individually instead.
 */
export async function deletePeriod(id: string): Promise<void> {
  await connectDB();
  const period = await AccountPeriodModel.findById(id).lean();
  if (!period) return;
  if (period.status !== 'CLOSED') throw new Error('Cannot delete the current open period');
  await AccountEntryModel.deleteMany({ periodId: id });
  await AccountPeriodModel.deleteOne({ _id: id });
}

/**
 * Closes the current open period (endDate = now) and immediately opens the
 * next one. Whatever the closed cycle's net came out to (surplus or
 * shortfall) is carried into the new cycle as an "Opening balance" entry —
 * cash on hand doesn't vanish just because a cycle ended, and this entry is
 * a normal one afterward: editable/deletable like anything else.
 */
export async function closeCurrentPeriod(): Promise<AccountPeriodItem> {
  await connectDB();
  const current = await ensureOpenPeriod();
  const doc = await AccountPeriodModel.findById(current.id);
  if (!doc) throw new Error('Period not found');
  const { net } = computeTotals(await listEntries(current.id));

  doc.status = 'CLOSED';
  doc.endDate = new Date();
  await doc.save();

  const next = await AccountPeriodModel.create({
    startDate: new Date(doc.endDate.getTime() + 86_400_000),
    status: 'OPEN',
  });
  if (net !== 0) {
    await AccountEntryModel.create({
      periodId: String(next._id),
      type: net > 0 ? 'RECEIVED' : 'EXPENSE',
      name: 'Opening balance',
      date: next.startDate,
      amount: Math.abs(net),
    });
  }

  return toPeriodItem(doc.toObject());
}
