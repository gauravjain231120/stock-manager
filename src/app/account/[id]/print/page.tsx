import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPeriod } from '@/lib/accounts';
import { PrintButton } from '@/components/PrintButton';
import { dateOnly, dateTime, inr } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPeriod(id);
  return { title: data ? `Rangrooh expense statement ${dateOnly(data.from)}` : 'Expense statement' };
}

const th = 'border-b-2 border-black/40 px-2 py-1.5 text-left font-semibold dark:border-white/40';
const thR = `${th} text-right`;
const td = 'border-b border-black/10 px-2 py-1 align-top dark:border-white/10';
const tdR = `${td} text-right tabular-nums`;

/**
 * The printable "bill": a bank-statement-style running balance, built to be
 * printed — the screen chrome carries `no-print`, so "Save as PDF" gives you
 * the sheet and nothing else. Same convention as /ship/stock-report.
 */
export default async function AccountPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const data = await getPeriod(id);
  if (!data) notFound();
  const { period, entries, totals, from, to } = data;
  const generated = dateTime(new Date());
  const rangeLabel = to ? `${dateOnly(from)} – ${dateOnly(to)}` : `${dateOnly(from)} – ongoing`;

  // Chronological (oldest first) — balance is a single figure at the end, not a
  // per-row running total.
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/account/${period.id}`}
          className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <ArrowLeft size={14} />
          Back
        </Link>
        <PrintButton auto={sp.print === '1'} />
      </div>

      <div className="print-sheet">
        <header className="mb-4">
          <h1 className="text-xl font-bold">Rangrooh — Expense Statement</h1>
          <p className="text-sm text-neutral-500 print-muted">
            {rangeLabel} · {period.status === 'OPEN' ? 'Current cycle (not yet closed)' : 'Closed'} · Generated {generated}
          </p>
        </header>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Description</th>
              <th className={thR}>Expense</th>
              <th className={thR}>Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>{dateOnly(r.date)}</td>
                <td className={td}>{r.name}</td>
                <td className={tdR}>{r.type === 'EXPENSE' ? inr(r.amount) : '—'}</td>
                <td className={tdR}>{r.type === 'RECEIVED' ? inr(r.amount) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-2 pt-2 text-xs font-semibold" colSpan={2}>
                Total
              </td>
              <td className="px-2 pt-2 text-right text-xs font-semibold tabular-nums">{inr(totals.expense)}</td>
              <td className="px-2 pt-2 text-right text-xs font-semibold tabular-nums">{inr(totals.received)}</td>
            </tr>
          </tfoot>
        </table>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">No entries in this period.</p>
        ) : null}

        <footer className="mt-6 text-[11px] text-neutral-500 print-muted">
          <p>
            Net for period: <strong>{inr(totals.net)}</strong>
            {totals.net >= 0 ? ' (surplus)' : ' (shortfall)'}
          </p>
        </footer>
      </div>
    </main>
  );
}
