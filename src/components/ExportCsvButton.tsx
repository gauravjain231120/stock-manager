'use client';

import { Download } from 'lucide-react';
import { downloadCsv } from '@/lib/csv';

/**
 * Exports whatever the table is currently showing. The count is in the label on
 * purpose — with filters applied it's the only way to know what you're getting
 * before you open the file.
 */
export function ExportCsvButton({
  count,
  filename,
  build,
  label = 'Export',
}: {
  count: number;
  filename: () => string;
  build: () => string;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={count === 0}
      onClick={() => downloadCsv(filename(), build())}
      title={count === 0 ? 'Nothing to export' : `Download these ${count} rows as a CSV`}
      className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
    >
      <Download size={14} />
      {label} {count}
    </button>
  );
}
