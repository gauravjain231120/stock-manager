'use client';

import { useState, useMemo } from 'react';
import { Panel, Table, Th, Td, Tr } from '@/components/ui';

export type AnalyticsRow = {
  sku: string;
  name: string;
  category: string;
  sold: number;
  returned: number;
  rto: number;
  customerReturns: number;
  returnRate: number;
  customerReturnRate: number;
  isToxic: boolean;
};

export function AnalyticsClient({ data }: { data: AnalyticsRow[] }) {
  const [sortCol, setSortCol] = useState<keyof AnalyticsRow | 'default'>('default');
  const [sortDesc, setSortDesc] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const categories = useMemo(() => {
    const cats = new Set(data.map(d => d.category));
    return ['ALL', ...Array.from(cats)].sort();
  }, [data]);

  const filteredData = useMemo(() => {
    let filtered = data;
    if (categoryFilter !== 'ALL') {
      filtered = filtered.filter(d => d.category === categoryFilter);
    }
    
    // Sort
    const sorted = [...filtered];
    if (sortCol === 'default') {
      // Default: Toxic first (highest rate first), then by Customer Return Rate
      sorted.sort((a, b) => {
        if (a.isToxic && !b.isToxic) return -1;
        if (!a.isToxic && b.isToxic) return 1;
        return b.customerReturnRate - a.customerReturnRate;
      });
    } else {
      sorted.sort((a, b) => {
        let valA = a[sortCol];
        let valB = b[sortCol];
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDesc ? valB - valA : valA - valB;
        }
        return 0;
      });
    }
    return sorted;
  }, [data, categoryFilter, sortCol, sortDesc]);

  const toggleSort = (col: keyof AnalyticsRow | 'default') => {
    if (sortCol === col) {
      setSortDesc(!sortDesc);
    } else {
      setSortCol(col);
      setSortDesc(true); // default to high-to-low for numbers
    }
  };

  const SortHeader = ({ col, label, right = false }: { col: keyof AnalyticsRow | 'default', label: string, right?: boolean }) => {
    const isActive = sortCol === col;
    return (
      <Th right={right}>
        <button 
          onClick={() => toggleSort(col)}
          className={`flex items-center gap-1 ${right ? 'ml-auto' : ''} hover:text-brand-600 dark:hover:text-brand-400 transition-colors ${isActive ? 'text-brand-700 dark:text-brand-300 font-bold' : ''}`}
        >
          {label}
          {isActive && (
            <span className="text-xs opacity-70">{sortDesc ? '↓' : '↑'}</span>
          )}
        </button>
      </Th>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="cat" className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Category Filter:</label>
          <select
            id="cat"
            className="rounded-md border-neutral-300 py-1.5 pl-3 pr-8 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-neutral-700 dark:bg-neutral-900"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            {categories.map(c => (
              <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-neutral-500">
          Showing {filteredData.length} items
        </div>
      </div>

      <Panel title="SKU Return Leaderboard">
        <div className="overflow-x-auto">
          <Table 
            head={
              <>
                <SortHeader col="sku" label="SKU" />
                <SortHeader col="name" label="Product" />
                <SortHeader col="category" label="Category" />
                <SortHeader col="sold" label="Sold" right />
                <SortHeader col="returned" label="Total Returned" right />
                <SortHeader col="rto" label="RTO (Courier)" right />
                <SortHeader col="customerReturns" label="Customer Returns" right />
                <SortHeader col="customerReturnRate" label="Customer Return %" right />
              </>
            } 
            empty={filteredData.length === 0}
          >
            {filteredData.map((row) => (
              <Tr key={row.sku}>
                <Td mono className={row.isToxic ? "text-red-600 font-bold dark:text-red-400" : ""}>{row.sku}</Td>
                <Td className={row.isToxic ? "text-red-600 font-medium dark:text-red-400" : "font-medium"}>{row.name}</Td>
                <Td className="text-neutral-500">{row.category}</Td>
                <Td right>{row.sold}</Td>
                <Td right>{row.returned}</Td>
                <Td right className="text-neutral-500">{row.rto}</Td>
                <Td right className={row.isToxic ? "text-red-600 font-bold dark:text-red-400" : ""}>{row.customerReturns}</Td>
                <Td right>
                  {row.customerReturnRate > 0 ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.isToxic ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'}`}>
                      {row.customerReturnRate.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-neutral-400">0%</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        </div>
      </Panel>
    </>
  );
}
