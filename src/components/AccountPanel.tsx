'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Printer } from 'lucide-react';
import { Panel, StatCard } from '@/components/ui';
import { EntryTable } from '@/components/EntryTable';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';
import { inr, dateOnly, dayKey } from '@/lib/format';
import type { AccountEntryItem, AccountPeriodItem, ClosedPeriodSummary, EntryType } from '@/lib/accounts';

const input =
  'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

function totalsOf(entries: AccountEntryItem[]) {
  const expense = entries.filter((e) => e.type === 'EXPENSE').reduce((a, e) => a + e.amount, 0);
  const received = entries.filter((e) => e.type === 'RECEIVED').reduce((a, e) => a + e.amount, 0);
  return { expense, received, net: received - expense };
}

/**
 * The live workspace: the current open period's entries (add/edit/delete),
 * and every closed period listed by its date range. Closing is the one
 * action that structurally changes things (a new open period replaces this
 * one) — the page gives this component a `key` of the open period's id, so
 * closing + router.refresh() remounts it fresh from the server rather than
 * trying to reconcile local state with a period that no longer exists.
 */
export function AccountPanel({
  initialOpen,
  initialClosed,
}: {
  initialOpen: { period: AccountPeriodItem; entries: AccountEntryItem[] };
  initialClosed: ClosedPeriodSummary[];
}) {
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [entries, setEntries] = useState(initialOpen.entries);
  const period = initialOpen.period;
  const closed = initialClosed;

  const [type, setType] = useState<EntryType>('EXPENSE');
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [amount, setAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);

  const totals = totalsOf(entries);

  async function addEntry(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
    setAdding(true);
    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: name.trim(), date, amount: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEntries((prev) => [data.entry as AccountEntryItem, ...prev]);
        setName('');
        setAmount('');
        toast.success(`${type === 'EXPENSE' ? 'Expense' : 'Received'} added ✓`);
      } else {
        toast.error(data?.error || 'Could not add entry');
      }
    } finally {
      setAdding(false);
    }
  }

  function updateLocal(id: string, patch: Partial<AccountEntryItem>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteLocal(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function closePeriod() {
    const ok = await ask({
      title: 'Close this period?',
      description: `${dateOnly(period.startDate)} – today gets locked in as a completed cycle, and a new one starts right after.`,
      details: [
        { label: 'Total expense', value: inr(totals.expense) },
        { label: 'Total received', value: inr(totals.received) },
        { label: 'Net', value: inr(totals.net) },
      ],
      confirmLabel: 'Close & start new',
    });
    if (!ok) return;
    setClosing(true);
    try {
      const res = await fetch('/api/account/close', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Period closed ✓');
        router.refresh();
      } else {
        toast.error(data?.error || 'Could not close period');
      }
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Account</h1>
          <p className="text-sm text-neutral-500">Current cycle: {dateOnly(period.startDate)} – ongoing</p>
        </div>
        <button
          onClick={closePeriod}
          disabled={closing || entries.length === 0}
          title={entries.length === 0 ? 'Add at least one entry first' : 'Lock in this cycle and start a fresh one'}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {closing ? 'Closing…' : 'Close period & start new'}
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total expense" value={inr(totals.expense)} tone="danger" />
        <StatCard label="Total received" value={inr(totals.received)} tone="good" />
        <StatCard label="Net" value={inr(totals.net)} tone={totals.net >= 0 ? 'good' : 'danger'} />
      </section>

      <form
        onSubmit={addEntry}
        className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900"
      >
        <div className="grid gap-4 sm:grid-cols-[auto_2fr_auto_auto_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as EntryType)} className={input}>
              <option value="EXPENSE">Expense</option>
              <option value="RECEIVED">Received</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fabric purchase"
              className={input}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Amount (₹)
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${input} w-28`}
              required
            />
          </label>
          <button
            disabled={adding}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus size={15} /> {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>

      <Panel title={`Entries (${entries.length})`}>
        <EntryTable entries={entries} onUpdate={updateLocal} onDelete={deleteLocal} />
      </Panel>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Past periods</h2>
        {closed.length === 0 ? (
          <Panel>
            <div className="px-5 py-8 text-center text-sm text-neutral-400">
              No closed periods yet — close the current one above when you&apos;re done with this cycle.
            </div>
          </Panel>
        ) : (
          closed.map((p) => (
            <Panel
              key={p.id}
              title={`${dateOnly(p.startDate)} – ${dateOnly(p.endDate)}`}
              actions={
                <div className="flex items-center gap-2">
                  <Link href={`/account/${p.id}`} className="text-xs font-medium text-neutral-500 hover:underline">
                    View
                  </Link>
                  <Link
                    href={`/account/${p.id}/print`}
                    target="_blank"
                    className="flex items-center gap-1.5 rounded-lg border border-black/15 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
                  >
                    <Printer size={12} /> Print
                  </Link>
                </div>
              }
            >
              <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-3 text-sm">
                <div>
                  <span className="text-neutral-500">Expense</span>{' '}
                  <span className="font-semibold text-red-600">{inr(p.totals.expense)}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Received</span>{' '}
                  <span className="font-semibold text-emerald-600">{inr(p.totals.received)}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Net</span>{' '}
                  <span className={`font-semibold ${p.totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {inr(p.totals.net)}
                  </span>
                </div>
              </div>
            </Panel>
          ))
        )}
      </div>
    </div>
  );
}
