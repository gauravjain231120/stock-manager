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
}

export interface ClosedPeriodSummary extends AccountPeriodItem {
  totals: PeriodTotals;
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
  return { period, entries, totals: computeTotals(entries) };
}

/** One period (open or closed) by id, with its entries — used by the detail/print pages. */
export async function getPeriod(id: string): Promise<PeriodWithEntries | null> {
  await connectDB();
  const doc = await AccountPeriodModel.findById(id).lean();
  if (!doc) return null;
  const period = toPeriodItem(doc);
  const entries = await listEntries(period.id);
  return { period, entries, totals: computeTotals(entries) };
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
    return { ...item, totals: computeTotals(byPeriod.get(item.id) ?? []) };
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

/** Closes the current open period (endDate = now) and immediately opens the next one. */
export async function closeCurrentPeriod(): Promise<AccountPeriodItem> {
  await connectDB();
  const current = await ensureOpenPeriod();
  const doc = await AccountPeriodModel.findById(current.id);
  if (!doc) throw new Error('Period not found');
  doc.status = 'CLOSED';
  doc.endDate = new Date();
  await doc.save();
  await AccountPeriodModel.create({ startDate: new Date(doc.endDate.getTime() + 86_400_000), status: 'OPEN' });
  return toPeriodItem(doc.toObject());
}
