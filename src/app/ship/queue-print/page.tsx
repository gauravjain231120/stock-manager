import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listPending, queueRows } from '@/lib/shipping';
import { PrintButton } from '@/components/PrintButton';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
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

// Myntra and Amazon pack first; everything else follows in no particular
// order, then unassigned rows last.
const PRINT_ORDER = ['MYNTRA', 'AMAZON', ...PLATFORMS.filter((p) => p !== 'MYNTRA' && p !== 'AMAZON')];
function platformRank(channel: string | null) {
  if (!channel) return PRINT_ORDER.length;
  const i = PRINT_ORDER.indexOf(channel);
  return i === -1 ? PRINT_ORDER.length : i;
}

const th = 'border-b-2 border-black/40 px-1.5 py-0.5 text-left font-semibold dark:border-white/40';
const thR = `${th} text-right`;
const td = 'border-b border-black/10 px-1.5 py-0.5 align-top dark:border-white/10';
const tdR = `${td} text-right tabular-nums`;

/**
 * The whole Ready-to-Ship queue — product, platform, stock, and status.
 * Compact enough that a normal queue lands on one page; a long one just
 * carries on to a second rather than losing rows. Screen chrome carries
 * `no-print`, so "Save as PDF" gives you just the sheet.
 */
export default async function QueuePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ print?: string }>;
}) {
  const sp = await searchParams;
  const pending = await listPending();
  // Sorted for print, not for the stock allocation above it — free/after are
  // already computed in queue order. Same product groups together first —
  // packing the same garment off two platforms shouldn't mean hunting two
  // spots on the sheet — then Myntra-before-Amazon breaks the tie.
  const rows = queueRows(pending).sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return platformRank(a.channel) - platformRank(b.channel);
  });
  const units = rows.reduce((a, r) => a + r.qty, 0);
  const generated = dateTime(new Date());

  // Rows are grouped by product now, not by platform, so this needs its own sort.
  const unitsByChannel = new Map<string, number>();
  for (const r of rows) {
    const key = r.channel ?? '';
    unitsByChannel.set(key, (unitsByChannel.get(key) ?? 0) + r.qty);
  }
  const platformSummary = [...unitsByChannel.entries()]
    .sort((a, b) => platformRank(a[0] || null) - platformRank(b[0] || null))
    .map(([channel, qty]) => `${platformLabel(channel || null)}: ${qty}`)
    .join(' · ');

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
        <p className="mb-1 text-[10px] text-neutral-500 print-muted">
          {rows.length} order{rows.length === 1 ? '' : 's'} · {units} unit{units === 1 ? '' : 's'} · {generated}
        </p>
        {platformSummary ? <p className="mb-1 text-[10px] font-semibold">{platformSummary}</p> : null}

        <table className="w-full border-collapse text-[10px] leading-tight">
          <thead>
            <tr>
              <th className={th}>#</th>
              <th className={th}>Product</th>
              <th className={th}>Platform</th>
              <th className={thR}>Stock</th>
              <th className={thR}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className={td}>{i + 1}</td>
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
      </div>
    </main>
  );
}
