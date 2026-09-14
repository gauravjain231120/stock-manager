import { listAccounts } from '@/lib/team';
import { getCurrentSession } from '@/lib/auth';
import { TeamPanel } from '@/components/TeamPanel';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const [accounts, session] = await Promise.all([listAccounts(), getCurrentSession()]);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <TeamPanel initialAccounts={accounts} currentAccountId={session?.accountId ?? null} />
    </main>
  );
}
