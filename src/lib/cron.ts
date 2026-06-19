import { headers } from 'next/headers';

/**
 * Guards cron endpoints. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 * when CRON_SECRET is set in the project env. In local dev (no secret) we allow it.
 */
export async function isAuthorizedCron(): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev convenience
  const auth = (await headers()).get('authorization');
  return auth === `Bearer ${secret}`;
}
