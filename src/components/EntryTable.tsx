'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Table, Th, Td, Tr, Badge } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmProvider';
import { useToast } from '@/components/ToastProvider';
import { inr, dateOnly } from '@/lib/format';
import type { AccountEntryItem, EntryType } from '@/lib/accounts';

const cellInput =
  'w-full rounded-lg border border-black/15 bg-transparent px-2 py-1 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none dark:border-white/20 dark:text-white';
const iconBtn =
  'inline-flex size-7 items-center justify-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10';

interface Draft {
  type: EntryType;
  name: string;
  date: string;
  amount: string;
}

/**
 * Every entry in a period, editable and deletable inline — regardless of
 * whether the period itself is open or closed, a typo should always be
 * fixable. Mutations bubble up via onUpdate/onDelete so the parent (which
 * needs the same list for its running totals) stays the single source of
 * truth for what's currently shown.
 */
export function EntryTable({
  entries,
  onUpdate,
  onDelete,
}: {
  entries: AccountEntryItem[];
  onUpdate: (id: string, patch: Partial<AccountEntryItem>) => void;
  onDelete: (id: string) => void;
}) {
  const ask = useConfirm();
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(e: AccountEntryItem) {
    setEditingId(e.id);
    setDraft({ type: e.type, name: e.name, date: e.date.slice(0, 10), amount: String(e.amount) });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!draft.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a name and a positive amount');
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/account/entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: draft.type, name: draft.name.trim(), date: draft.date, amount }),
      });
      if (res.ok) {
        onUpdate(id, { type: draft.type, name: draft.name.trim(), date: new Date(draft.date).toISOString(), amount });
        toast.success('Entry updated ✓');
        cancelEdit();
      } else {
        toast.error('Could not save entry');
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(e: AccountEntryItem) {
    const ok = await ask({
      title: 'Delete this entry?',
      description: 'This cannot be undone.',
      details: [
        { label: 'Name', value: e.name },
        { label: 'Date', value: dateOnly(e.date) },
        { label: 'Type', value: e.type === 'EXPENSE' ? 'Expense' : 'Received' },
        { label: 'Amount', value: inr(e.amount) },
      ],
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusyId(e.id);
    try {
      const res = await fetch(`/api/account/entries/${e.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(e.id);
        toast.success('Entry deleted ✓');
      } else {
        toast.error('Could not delete entry');
      }
    } finally {
      setBusyId(null);
    }
  }

  if (entries.length === 0) {
    return <div className="px-5 py-8 text-center text-sm text-neutral-400">No entries yet.</div>;
  }

  return (
    <Table head={<><Th>Date</Th><Th>Name</Th><Th>Type</Th><Th right>Amount</Th><Th right>Action</Th></>}>
      {entries.map((e) => {
        const editing = editingId === e.id;
        const busy = busyId === e.id;
        if (editing && draft) {
          return (
            <Tr key={e.id}>
              <Td>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(ev) => setDraft({ ...draft, date: ev.target.value })}
                  className={cellInput}
                />
              </Td>
              <Td>
                <input
                  value={draft.name}
                  onChange={(ev) => setDraft({ ...draft, name: ev.target.value })}
                  className={cellInput}
                  autoFocus
                />
              </Td>
              <Td>
                <select
                  value={draft.type}
                  onChange={(ev) => setDraft({ ...draft, type: ev.target.value as EntryType })}
                  className={cellInput}
                >
                  <option value="EXPENSE">Expense</option>
                  <option value="RECEIVED">Received</option>
                </select>
              </Td>
              <Td right>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.amount}
                  onChange={(ev) => setDraft({ ...draft, amount: ev.target.value })}
                  className={`${cellInput} text-right tabular-nums`}
                />
              </Td>
              <Td right>
                <div className="flex justify-end gap-1">
                  <button onClick={() => saveEdit(e.id)} disabled={busy} className={`${iconBtn} text-emerald-600 disabled:opacity-50`} title="Save">
                    <Check size={15} />
                  </button>
                  <button onClick={cancelEdit} disabled={busy} className={`${iconBtn} text-neutral-400`} title="Cancel">
                    <X size={15} />
                  </button>
                </div>
              </Td>
            </Tr>
          );
        }
        return (
          <Tr key={e.id}>
            <Td>{dateOnly(e.date)}</Td>
            <Td>{e.name}</Td>
            <Td>
              <Badge tone={e.type === 'EXPENSE' ? 'danger' : 'good'}>{e.type === 'EXPENSE' ? 'Expense' : 'Received'}</Badge>
            </Td>
            <Td right className={`font-medium ${e.type === 'EXPENSE' ? 'text-red-600' : 'text-emerald-600'}`}>
              {e.type === 'EXPENSE' ? '−' : '+'}
              {inr(e.amount)}
            </Td>
            <Td right>
              <div className="flex justify-end gap-1">
                <button onClick={() => startEdit(e)} disabled={busy} className={`${iconBtn} text-neutral-500 disabled:opacity-50`} title="Edit">
                  <Pencil size={14} />
                </button>
                <button onClick={() => remove(e)} disabled={busy} className={`${iconBtn} text-red-600 disabled:opacity-50`} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </Td>
          </Tr>
        );
      })}
    </Table>
  );
}
