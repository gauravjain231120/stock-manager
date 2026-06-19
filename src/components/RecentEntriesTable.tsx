'use client';

import { useState } from 'react';
import { Panel, Table, Th, Td, Tr } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { timeAgo } from '@/lib/format';
import { PLATFORM_LABELS, Platform } from '@/lib/constants';

export interface Entry {
  id: string;
  createdAt: string;
  type: string;
  sku: string;
  qty: number;
  channel: string | null;
}

const TYPE_LABEL: Record<string, string> = { PRODUCED: 'Produce', SOLD: 'Ship', RETURNED: 'Return' };

function platformLabel(channel: string | null) {
  if (!channel) return '—';
  return PLATFORM_LABELS[channel as Platform] ?? channel;
}

export function RecentEntriesTable({ entries }: { entries: Entry[] }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const filtered = query
    ? entries.filter((e) =>
        `${e.sku} ${TYPE_LABEL[e.type] ?? e.type} ${platformLabel(e.channel)}`.toLowerCase().includes(query),
      )
    : entries;

  return (
    <Panel
      title="Recent entries — delete one to undo it"
      actions={
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search SKU, action or platform…"
          className="w-64 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20"
        />
      }
    >
      <Table head={<><Th>When</Th><Th>Action</Th><Th>SKU</Th><Th>Platform</Th><Th right>Qty</Th><Th right>Undo</Th></>} empty={filtered.length === 0}>
        {filtered.map((e) => (
          <Tr key={e.id}>
            <Td>{timeAgo(e.createdAt)}</Td>
            <Td>{TYPE_LABEL[e.type] ?? e.type}</Td>
            <Td mono>{e.sku}</Td>
            <Td>{platformLabel(e.channel)}</Td>
            <Td right>{Math.abs(e.qty)}</Td>
            <Td right>
              <ActionButton
                label="Delete"
                endpoint={`/api/register/${e.id}`}
                method="DELETE"
                variant="danger"
                confirm="Delete this entry? The stock count will be adjusted back."
                successMessage="undone ✓"
              />
            </Td>
          </Tr>
        ))}
      </Table>
    </Panel>
  );
}
