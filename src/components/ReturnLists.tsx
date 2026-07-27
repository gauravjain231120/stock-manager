'use client';

import { useState } from 'react';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { EditReturnButton } from '@/components/EditReturnButton';
import { dateOnly, matchesSearch } from '@/lib/format';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';
import type { ReturnRow } from '@/lib/returnShipments';

const CONDITION_TONE = { GOOD: 'good', BAD: 'warn', WRONG: 'danger' } as const;
const CONDITION_LABEL = { GOOD: 'Good', BAD: 'Damaged', WRONG: 'Wrong item' } as const;

function platformLabel(c: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

function ProductCell({ r }: { r: ReturnRow }) {
  return (
    <div>
      <div className="font-medium">{r.name}</div>
      <div className="font-mono text-[11px] text-neutral-500">{r.sku}</div>
      {r.orderId ? <div className="text-[11px] text-neutral-400">Order {r.orderId}</div> : null}
    </div>
  );
}

/** The two return lists: parcels still coming, and ones already scanned in. */
export function ReturnLists({
  expected,
  received,
  products,
}: {
  expected: ReturnRow[];
  received: ReturnRow[];
  products: { sku: string; name: string }[];
}) {
  const [q, setQ] = useState('');

  const match = (r: ReturnRow) =>
    !q.trim() || matchesSearch(`${r.trackingId} ${r.sku} ${r.name} ${r.orderId ?? ''} ${platformLabel(r.channel)}`, q, r.sku);
  const exp = expected.filter(match);
  const rec = received.filter(match);

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title={`On the way (${exp.length})`}
        actions={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tracking, product or order…"
            className="w-48 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20 sm:w-72"
          />
        }
      >
        <Table
          head={<><Th>Started</Th><Th>Tracking</Th><Th>Product</Th><Th>Platform</Th><Th right>Qty</Th><Th right>Waiting</Th><Th right>Edit / Remove</Th></>}
          empty={exp.length === 0}
        >
          {exp.map((r) => (
            <Tr key={r.id}>
              <Td>{dateOnly(r.initiatedAt)}</Td>
              <Td mono>{r.trackingId}</Td>
              <Td><ProductCell r={r} /></Td>
              <Td>{platformLabel(r.channel)}</Td>
              <Td right>{r.qty}</Td>
              <Td right>
                {r.overdue ? (
                  <Badge tone="danger">{r.waitingDays} days — chase it</Badge>
                ) : (
                  <span className="text-neutral-500">{r.waitingDays === 0 ? 'today' : `${r.waitingDays}d`}</span>
                )}
              </Td>
              <Td right>
                <span className="inline-flex gap-2">
                  <EditReturnButton row={r} products={products} />
                  <ActionButton
                    label="Remove"
                    endpoint={`/api/return-shipments/${r.id}`}
                    method="DELETE"
                    variant="secondary"
                    confirmTitle="Remove this return?"
                    confirm="It was added by mistake — nothing happens to stock."
                    confirmDetails={[{ label: 'Tracking', value: r.trackingId }, { label: 'Product', value: r.sku }]}
                    confirmLabel="Remove"
                    successMessage="Removed"
                  />
                </span>
              </Td>
            </Tr>
          ))}
        </Table>
      </Panel>

      <Panel title={`Received (${rec.length})`}>
        <Table
          head={<><Th>Received</Th><Th>Tracking</Th><Th>Product</Th><Th>Platform</Th><Th right>Qty</Th><Th right>Condition</Th></>}
          empty={rec.length === 0}
        >
          {rec.map((r) => (
            <Tr key={r.id}>
              <Td>{dateOnly(r.receivedAt)}</Td>
              <Td mono>{r.trackingId}</Td>
              <Td>
                <ProductCell r={r} />
                {r.note ? <div className="text-[11px] text-neutral-400">“{r.note}”</div> : null}
              </Td>
              <Td>{platformLabel(r.channel)}</Td>
              <Td right>{r.qty}</Td>
              <Td right>
                {r.condition ? <Badge tone={CONDITION_TONE[r.condition]}>{CONDITION_LABEL[r.condition]}</Badge> : '—'}
              </Td>
            </Tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
