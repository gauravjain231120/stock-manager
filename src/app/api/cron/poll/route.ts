import { isAuthorizedCron } from '@/lib/cron';
import { ingestAllOrders } from '@/lib/orders';
import { ingestAllReturns } from '@/lib/returns';
import { syncAll } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds (Vercel function limit)

/**
 * Scheduled poller (Vercel Cron). Pulls new orders and returns from every channel,
 * then re-syncs stock to all channels. Schedule lives in vercel.json.
 *
 * This is the serverless-native replacement for an always-on worker. For per-SKU
 * durable retries at higher volume, move the resync onto Inngest/QStash later.
 */
async function run() {
  const orders = await ingestAllOrders();
  const returns = await ingestAllReturns();
  const sync = await syncAll();
  return {
    orders,
    returns,
    sync: { pushed: sync.length, changed: sync.filter((r) => r.changed).length, failed: sync.filter((r) => !r.ok).length },
  };
}

export async function GET() {
  if (!(await isAuthorizedCron())) return new Response('Unauthorized', { status: 401 });
  return Response.json({ ok: true, ...(await run()) });
}

// Vercel Cron uses GET; POST allowed for manual triggering from the UI.
export async function POST() {
  if (!(await isAuthorizedCron())) return new Response('Unauthorized', { status: 401 });
  return Response.json({ ok: true, ...(await run()) });
}
