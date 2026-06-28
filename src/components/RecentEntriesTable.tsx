'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Panel, Table, Th, Td, Tr } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { useConfirm } from '@/components/ConfirmProvider';
import { dateOnly, matchesSearch } from '@/lib/format';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';

export interface Entry {
  id: string;
  createdAt: string;
  type: string;
  sku: string;
  qty: number;
  channel: string | null;
}

const TYPE_LABEL: Record<string, string> = { PRODUCED: 'Produce', SOLD: 'Ship', RETURNED: 'Return', ADJUSTED: 'Opening' };

function platformLabel(channel: string | null) {
  if (!channel) return '—';
  return PLATFORM_LABELS[channel as Platform] ?? channel;
}

const inputCls = 'rounded-lg border border-black/15 bg-transparent px-2 py-1 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

export function RecentEntriesTable({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const ask = useConfirm();
  const [q, setQ] = useState('');

  // per-row edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [eQty, setEQty] = useState('');
  const [eChannel, setEChannel] = useState<Platform>('AMAZON');
  const [eDate, setEDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = q.trim()
    ? entries.filter((e) => matchesSearch(`${e.sku} ${TYPE_LABEL[e.type] ?? e.type} ${platformLabel(e.channel)}`, q))
    : entries;

  function startEdit(e: Entry) {
    setEditId(e.id);
    setEQty(String(Math.abs(e.qty)));
    setEChannel((e.channel as Platform) || 'AMAZON');
    setEDate(e.createdAt.slice(0, 10)); // YYYY-MM-DD
    setMsg(null);
  }

  async function saveEdit(e: Entry) {
    const isShipReturn = e.type === 'SOLD' || e.type === 'RETURNED';
    const ok = await ask({
      title: 'Save changes?',
      details: [
        { label: 'Action', value: TYPE_LABEL[e.type] ?? e.type },
        { label: 'SKU', value: e.sku },
        { label: 'Quantity', value: eQty },
        ...(isShipReturn ? [{ label: 'Platform', value: PLATFORM_LABELS[eChannel] }] : []),
        { label: 'Date', value: eDate },
      ],
      confirmLabel: 'Save',
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/register/${e.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qty: Number(eQty),
          channel: isShipReturn ? eChannel : undefined,
          date: eDate || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(data?.error || `Error ${res.status}`);
      else {
        setEditId(null);
        router.refresh();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={`All entries (${filtered.length}) — edit or delete to fix`}
      actions={
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search SKU, action or platform…"
          className="w-64 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20"
        />
      }
    >
      {msg ? <div className="px-5 pt-3 text-xs text-red-600">{msg}</div> : null}
      <Table head={<><Th>Date</Th><Th>Action</Th><Th>SKU</Th><Th>Platform</Th><Th right>Qty</Th><Th right>Edit / Delete</Th></>} empty={filtered.length === 0}>
        {filtered.map((e) => {
          const editing = editId === e.id;
          const isShipReturn = e.type === 'SOLD' || e.type === 'RETURNED';
          return (
            <Tr key={e.id}>
              <Td>
                {editing ? (
                  <input type="date" className={inputCls} value={eDate} onChange={(ev) => setEDate(ev.target.value)} />
                ) : (
                  dateOnly(e.createdAt)
                )}
              </Td>
              <Td>{TYPE_LABEL[e.type] ?? e.type}</Td>
              <Td mono>{e.sku}</Td>
              <Td>
                {editing && isShipReturn ? (
                  <select className={inputCls} value={eChannel} onChange={(ev) => setEChannel(ev.target.value as Platform)}>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                  </select>
                ) : (
                  platformLabel(e.channel)
                )}
              </Td>
              <Td right>
                {editing ? (
                  <input type="number" min={1} className={`${inputCls} w-20 text-right`} value={eQty} onChange={(ev) => setEQty(ev.target.value)} />
                ) : (
                  Math.abs(e.qty)
                )}
              </Td>
              <Td right>
                {editing ? (
                  <span className="inline-flex gap-2">
                    <button onClick={() => saveEdit(e)} disabled={busy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">Save</button>
                    <button onClick={() => setEditId(null)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">Cancel</button>
                  </span>
                ) : (
                  <span className="inline-flex gap-2">
                    <button onClick={() => startEdit(e)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">Edit</button>
                    <ActionButton
                      label="Delete"
                      endpoint={`/api/register/${e.id}`}
                      method="DELETE"
                      variant="danger"
                      confirmTitle="Delete this entry?"
                      confirm="The stock count will be adjusted back."
                      confirmDetails={[
                        { label: 'Action', value: TYPE_LABEL[e.type] ?? e.type },
                        { label: 'SKU', value: e.sku },
                        { label: 'Quantity', value: String(Math.abs(e.qty)) },
                        ...(e.channel ? [{ label: 'Platform', value: platformLabel(e.channel) }] : []),
                      ]}
                      confirmLabel="Delete"
                      successMessage="undone ✓"
                    />
                  </span>
                )}
              </Td>
            </Tr>
          );
        })}
      </Table>
    </Panel>
  );
}
