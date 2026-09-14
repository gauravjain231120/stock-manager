'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Panel, Badge } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import { normalizeTracking } from '@/lib/constants';
import type { QuickCheckLine } from '@/lib/returnReports';

interface FileResult {
  fileName: string;
  date: string | null;
  lines: QuickCheckLine[];
}

/** Pulls a YYYY-MM-DD out of a filename like RETURNS_2026-09-12_....xlsx — for
 *  labeling each file's result, not for filtering the check itself (a parcel
 *  listed today may only get logged as returned a few days later). */
function extractDate(fileName: string): string | null {
  return fileName.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

/** Finds whichever column looks like the tracking-number one (falls back to the
 *  first column if no header says so) and pulls every value under it. */
function extractTrackingIds(rows: unknown[][]): string[] {
  if (rows.length === 0) return [];
  const header = (rows[0] ?? []).map((c) => String(c ?? '').trim().toLowerCase());
  const headerHasTrackingCol = header.some((h) => h.includes('tracking'));
  const col = Math.max(0, header.findIndex((h) => h.includes('tracking')));
  const startRow = headerHasTrackingCol ? 1 : 0;
  const ids: string[] = [];
  for (let i = startRow; i < rows.length; i++) {
    const v = rows[i]?.[col];
    if (v != null && String(v).trim()) ids.push(String(v).trim());
  }
  return ids;
}

async function parseFile(file: File): Promise<string[]> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split(','));
    return extractTrackingIds(rows);
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  return extractTrackingIds(rows);
}

/**
 * Upload Myntra's return-report file(s) and see which tracking numbers are
 * missing from what's actually logged as returned — nothing here is saved
 * anywhere, purely a one-time check. For keeping a report over time (and
 * marking parcels claimed/written off), see the saved reports below instead.
 */
export function QuickReturnCheck() {
  const toast = useToast();
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const files = Array.from(fileList);
      const parsed = await Promise.all(
        files.map(async (f) => ({ fileName: f.name, date: extractDate(f.name), trackingIds: await parseFile(f) })),
      );

      const empty = parsed.filter((p) => p.trackingIds.length === 0);
      if (empty.length > 0) {
        toast.error(`Couldn't find any tracking numbers in: ${empty.map((p) => p.fileName).join(', ')}`);
      }
      const usable = parsed.filter((p) => p.trackingIds.length > 0);
      if (usable.length === 0) {
        setResults([]);
        return;
      }

      const allIds = [...new Set(usable.flatMap((p) => p.trackingIds))];
      const res = await fetch('/api/return-reports/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingIds: allIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'Could not check tracking numbers');
        return;
      }
      const lineByTracking = new Map<string, QuickCheckLine>((data.lines as QuickCheckLine[]).map((l) => [l.trackingId, l]));

      setResults(
        usable.map((p) => ({
          fileName: p.fileName,
          date: p.date,
          lines: p.trackingIds
            .map((raw) => {
              const code = normalizeTracking(raw);
              return code ? lineByTracking.get(code) : undefined;
            })
            .filter((l): l is QuickCheckLine => Boolean(l)),
        })),
      );
    } catch {
      toast.error('Could not read one of those files');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Quick check — upload Myntra's file (no save)">
      <div className="p-5">
        <p className="mb-3 text-sm text-neutral-500">
          Upload one or more of Myntra&apos;s return report files (.xlsx or .csv) — this just checks each tracking
          number against what you&apos;ve actually logged as returned. Nothing is saved.
        </p>
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-black/20 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10">
          <Upload size={15} />
          {busy ? 'Checking…' : 'Choose file(s)'}
          <input
            type="file"
            multiple
            accept=".xlsx,.csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>

        {results.length > 0 ? (
          <div className="mt-5 flex flex-col gap-4">
            {results.map((r) => {
              const missing = r.lines.filter((l) => !l.received);
              const received = r.lines.filter((l) => l.received);
              return (
                <div key={r.fileName} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.fileName}</span>
                    {r.date ? <span className="text-xs text-neutral-400">({r.date})</span> : null}
                    <span className="ml-auto flex gap-2">
                      <Badge tone="good">{received.length} received</Badge>
                      {missing.length > 0 ? <Badge tone="danger">{missing.length} missing</Badge> : null}
                    </span>
                  </div>
                  {missing.length === 0 ? (
                    <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                      <CheckCircle2 size={15} /> All received.
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {missing.map((l) => (
                        <li key={l.trackingId} className="flex items-center gap-1.5 font-mono text-xs text-red-600">
                          <AlertTriangle size={12} /> {l.trackingId}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
