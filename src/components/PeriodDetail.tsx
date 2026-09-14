'use client';

import { useState } from 'react';
import { Panel, StatCard } from '@/components/ui';
import { EntryTable } from '@/components/EntryTable';
import { inr } from '@/lib/format';
import type { AccountEntryItem } from '@/lib/accounts';

/** Read/edit view of one period's entries — no add-form or close button; new entries always go through /account. */
export function PeriodDetail({ initialEntries }: { initialEntries: AccountEntryItem[] }) {
  const [entries, setEntries] = useState(initialEntries);

  const expense = entries.filter((e) => e.type === 'EXPENSE').reduce((a, e) => a + e.amount, 0);
  const received = entries.filter((e) => e.type === 'RECEIVED').reduce((a, e) => a + e.amount, 0);
  const net = received - expense;

  function updateLocal(id: string, patch: Partial<AccountEntryItem>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteLocal(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total expense" value={inr(expense)} tone="danger" />
        <StatCard label="Total received" value={inr(received)} tone="good" />
        <StatCard label="Net" value={inr(net)} tone={net >= 0 ? 'good' : 'danger'} />
      </section>
      <Panel title={`Entries (${entries.length})`}>
        <EntryTable entries={entries} onUpdate={updateLocal} onDelete={deleteLocal} />
      </Panel>
    </div>
  );
}
