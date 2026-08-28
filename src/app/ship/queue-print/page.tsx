import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listPending, queueRows } from '@/lib/shipping';
import { PrintButton } from '@/components/PrintButton';
import { FitOnePage } from '@/components/FitOnePage';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';
import { dateTime, dayKey } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Chrome names the saved file after the document title, so put the date in it.
export async function generateMetadata() {
  return { title: `Rangrooh Ready to Ship queue ${dayKey(new Date())}` };
}

function platformLabel(c?: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

function statusLabel(free: number) {
  if (free <= 0) return 'Out of stock';
  if (free <= 5) return 'Low';
  return 'Good';
}

const th = 'border-b-2 border-black/40 px-2 py-1 text-left font-semibold dark:border-white/40';
const thR = `${th} text-right`;
const td = 'border-b border-black/10 px-2 py-1 align-top dark:border-white/10';
const tdR = `${td} text-right tabular-nums`;

/**
 * The whole Ready-to-Ship queue — product, platform, stock, and status — on
 * one printed page, whatever the queue's size (see FitOnePage). Screen chrome
 * carries `no-print`, so "Save as PDF" gives you just the sheet.
 */
export default async function QueuePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ print?: string }>;
}) {
  const sp = await searchParams;
  const pending = await listPending();
  const rows = queueRows(pending);
  const units = rows.reduce((a, r) => a + r.qty, 0);
  const generated = dateTime(new Date());

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/ship"
          className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <ArrowLeft size={14} />
          Back to Ready to Ship
        </Link>
        <PrintButton auto={sp.print === '1'} />
      </div>

      <div className="print-sheet">
        <FitOnePage>
          <header className="mb-3">
            <h1 className="text-xl font-bold">Ready to Ship — full queue</h1>
            <p className="text-sm text-neutral-500 print-muted">
              {rows.length} order{rows.length === 1 ? '' : 's'} · {units} unit{units === 1 ? '' : 's'} · {generated}
            </p>
          </header>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Product</th>
                <th className={th}>Platform</th>
                <th className={thR}>Stock</th>
                <th className={thR}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{r.name}</td>
                  <td className={td}>{platformLabel(r.channel)}</td>
                  <td className={tdR}>{r.free}</td>
                  <td className={`${tdR} ${r.after < 0 ? 'print-short text-red-600' : ''}`}>
                    {r.after < 0 ? `Out of stock (make ${-r.after})` : statusLabel(r.free)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">Nothing queued right now.</p>
          ) : null}
        </FitOnePage>
      </div>
    </main>
  );
}
