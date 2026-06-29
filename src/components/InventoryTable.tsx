'use client';

import { useState } from 'react';
import { Panel, Table, Th, Td, Tr, Badge } from '@/components/ui';
import { EditableStock } from '@/components/EditableStock';
import { compareVariant, groupVariants, matchesSearch } from '@/lib/format';

export interface InvRow {
  sku: string;
  name: string;
  category: string;
  onHand: number;
  shipped: number;
  returned: number;
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

  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();

  const filtered = rows
    .filter((r) => {
      if (cat && r.category !== cat) return false;
      if (q.trim() && !matchesSearch(`${r.sku} ${r.name} ${r.category}`, q)) return false;
      return true;
    })
    .sort((a, b) => compareVariant(a.sku, b.sku));

  const groups = groupVariants(filtered, (r) => r.sku.split('-').pop() ?? '');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-3 text-sm font-medium">All products ({filtered.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white sm:w-auto"
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
            className="w-full flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white sm:w-auto sm:min-w-[16rem]"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <Panel><div className="px-5 py-8 text-center text-sm text-neutral-400">No matches.</div></Panel>
      ) : (
        groups.map((g) => {
          const groupStock = g.rows.reduce((a, r) => a + r.onHand, 0);
          return (
            <Panel key={g.key} title={g.title} actions={<span className="text-xs text-neutral-400">{groupStock} on hand</span>}>
              <Table head={<><Th>Size</Th><Th right>Shipped</Th><Th right>Returned</Th><Th right>On hand</Th><Th right>Status</Th></>}>
                {g.rows.map((r) => {
                  const s = stockStatus(r.onHand);
                  return (
                    <Tr key={r.sku}>
                      <Td>{r.sku.split('-').pop()}</Td>
                      <Td right>{r.shipped}</Td>
                      <Td right>{r.returned}</Td>
                      <Td right><EditableStock sku={r.sku} value={r.onHand} /></Td>
                      <Td right><Badge tone={s.tone}>{s.label}</Badge></Td>
                    </Tr>
                  );
                })}
              </Table>
            </Panel>
          );
        })
      )}
    </div>
  );
}
