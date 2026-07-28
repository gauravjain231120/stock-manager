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
  product: { name: string; color: string; size: string } | null;
  trackingId: string | null;
}

const TYPE_LABEL: Record<string, string> = { PRODUCED: 'Produce', SOLD: 'Ship', RETURNED: 'Return', ADJUSTED: 'Opening' };

function platformLabel(channel: string | null) {
  if (!channel) return '—';
  return PLATFORM_LABELS[channel as Platform] ?? channel;
}

const inputCls = 'rounded-lg border border-black/15 bg-transparent px-2 py-1 text-sm text-neutral-900 dark:border-white/20 dark:text-white';
const filterCls = 'rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

// Action-filter choices — the three real stock actions shown in the log.
const ACTION_OPTIONS = [
  { value: 'PRODUCED', label: 'Produce' },
  { value: 'SOLD', label: 'Ship' },
  { value: 'RETURNED', label: 'Return' },
];

const PER_PAGE_OPTIONS = [20, 50, 80, 100, 200, 300];

const pagerBtnCls =
  'rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10';

export function RecentEntriesTable({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const ask = useConfirm();
  const [q, setQ] = useState('');
  const [fAction, setFAction] = useState('all');
  const [fPlatform, setFPlatform] = useState('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  // per-row edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [eQty, setEQty] = useState('');
  const [eChannel, setEChannel] = useState<Platform>('AMAZON');
  const [eDate, setEDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = entries.filter((e) => {
    if (fAction !== 'all' && e.type !== fAction) return false;
    if (fPlatform !== 'all' && e.channel !== fPlatform) return false;
    if (!q.trim()) return true;
    const p = e.product;
    const hay = `${e.sku} ${p ? `${p.name} ${p.color} ${p.size}` : ''} ${TYPE_LABEL[e.type] ?? e.type} ${platformLabel(e.channel)} ${e.trackingId ?? ''}`;
    return matchesSearch(hay, q, e.sku);
  });

  // Pagination over the filtered list; `cur` self-clamps when filters shrink it.
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const cur = Math.min(page, pageCount);
  const pageRows = filtered.slice((cur - 1) * perPage, cur * perPage);
  const from = filtered.length === 0 ? 0 : (cur - 1) * perPage + 1;
  const to = Math.min(cur * perPage, filtered.length);

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select value={fAction} onChange={(e) => { setFAction(e.target.value); setPage(1); }} aria-label="Filter by action" className={filterCls}>
            <option value="all">All actions</option>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select value={fPlatform} onChange={(e) => { setFPlatform(e.target.value); setPage(1); }} aria-label="Filter by platform" className={filterCls}>
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search product, SKU or platform…"
            className="w-48 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20 sm:w-64"
          />
        </div>
      }
    >
      {msg ? <div className="px-5 pt-3 text-xs text-red-600">{msg}</div> : null}
      <Table head={<><Th>Date</Th><Th>Action</Th><Th>Product</Th><Th>Platform</Th><Th right>Qty</Th><Th right>Edit / Delete</Th></>} empty={filtered.length === 0}>
        {pageRows.map((e) => {
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
              <Td>
                {e.product ? (
                  <div>
                    <div className="font-medium">
                      {e.product.name}
                      {e.product.color ? ` — ${e.product.color}` : ''}
                      {e.product.size ? <span className="text-neutral-500"> · {e.product.size}</span> : null}
                    </div>
                    <div className="font-mono text-xs text-neutral-500">{e.sku}</div>
                  </div>
                ) : (
                  <span className="font-mono text-xs">{e.sku}</span>
                )}
                {e.trackingId ? (
                  <div className="font-mono text-[11px] text-neutral-400">#{e.trackingId}</div>
                ) : null}
              </Td>
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

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-3 dark:border-white/10">
          <span className="text-sm text-neutral-500">
            Showing {from}–{to} of {filtered.length}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              aria-label="Entries per page"
              className={filterCls}
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
            <button onClick={() => setPage(cur - 1)} disabled={cur <= 1} className={pagerBtnCls}>
              ‹ Prev
            </button>
            <span className="text-sm tabular-nums text-neutral-500">
              Page {cur} of {pageCount}
            </span>
            <button onClick={() => setPage(cur + 1)} disabled={cur >= pageCount} className={pagerBtnCls}>
              Next ›
            </button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
