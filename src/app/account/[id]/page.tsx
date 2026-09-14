import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { getPeriod } from '@/lib/accounts';
import { PeriodDetail } from '@/components/PeriodDetail';
import { dateOnly } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AccountPeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPeriod(id);
  if (!data) notFound();
  const { period, entries, from, to } = data;
  const rangeLabel = to ? `${dateOnly(from)} – ${dateOnly(to)}` : `${dateOnly(from)} – ongoing`;

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/account"
          className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <ArrowLeft size={14} />
          Back to Account
        </Link>
        <Link
          href={`/account/${period.id}/print`}
          target="_blank"
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          <Printer size={14} />
          Print
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-bold">{rangeLabel}</h1>
        <p className="text-sm text-neutral-500">{period.status === 'OPEN' ? 'Current cycle' : 'Closed'}</p>
      </div>

      <PeriodDetail initialEntries={entries} />
    </main>
  );
}
