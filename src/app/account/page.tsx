import { getOpenPeriodWithEntries, listClosedPeriods } from '@/lib/accounts';
import { AccountPanel } from '@/components/AccountPanel';

export const dynamic = 'force-dynamic';

// Not in the sidebar — reachable only by going to /account directly.
export default async function AccountPage() {
  const [open, closed] = await Promise.all([getOpenPeriodWithEntries(), listClosedPeriods()]);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      {/* Keyed by the open period's id: after "Close & start new" the id changes,
          which remounts this fresh from the server instead of trying to patch
          local state onto a period that no longer exists. */}
      <AccountPanel key={open.period.id} initialOpen={open} initialClosed={closed} />
    </main>
  );
}
