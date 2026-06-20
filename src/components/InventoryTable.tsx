'use client';

import { useState } from 'react';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { EditableStock } from '@/components/EditableStock';

export interface InvRow {
  sku: string;
  name: string;
  category: string;
  onHand: number;
}

// 0 = make it, 1–5 = low, >5 = good.
function stockStatus(onHand: number) {
  if (onHand <= 0) return { label: 'Out of stock', tone: 'danger' as const, color: 'text-red-600' };
  if (onHand <= 5) return { label: 'Low', tone: 'warn' as const, color: 'text-amber-600' };
  return { label: 'Good', tone: 'good' as const, color: 'text-emerald-600' };
}

export function InventoryTable({ rows }: { rows: InvRow[] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const query = q.trim().toLowerCase();

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();

  const filtered = rows.filter((r) => {
    if (cat && r.category !== cat) return false;
    if (query && !`${r.sku} ${r.name} ${r.category}`.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <Panel
      title={`All products (${filtered.length})`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU, name or category…"
            className="w-64 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm text-neutral-900 dark:border-white/20 dark:text-white"
          />
        </div>
      }
    >
      <Table head={<><Th>SKU</Th><Th>Name</Th><Th>Category</Th><Th right>On hand</Th><Th right>Status</Th></>} empty={filtered.length === 0}>
        {filtered.map((r) => {
          const s = stockStatus(r.onHand);
          return (
            <Tr key={r.sku}>
              <Td mono>{r.sku}</Td>
              <Td>{r.name}</Td>
              <Td>{r.category}</Td>
              <Td right><EditableStock sku={r.sku} value={r.onHand} /></Td>
              <Td right><Badge tone={s.tone}>{s.label}</Badge></Td>
            </Tr>
          );
        })}
      </Table>
    </Panel>
  );
}
