'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { Panel, Badge } from '@/components/ui';
import { useToast } from '@/components/ToastProvider';
import type { QuickCheckLine, ExtraReturnLine } from '@/lib/returnReports';

interface DateGroupResult {
  date: string | null;
  fileNames: string[];
  missing: QuickCheckLine[];
  extra: ExtraReturnLine[];
}

/** Pulls a YYYY-MM-DD out of a filename like RETURNS_2026-09-12_....xlsx. Used
 *  both to label each file's result and to scope the "extra" check to that
 *  exact day (see findExtraReturnsForDay). */
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
 * Upload Myntra's return-report file(s) and check both directions at once —
 * nothing here is saved anywhere, purely a one-time check. For keeping a
 * report over time (and marking parcels claimed/written off), see the saved
 * reports below instead.
 */
export function QuickReturnCheck() {
  const toast = useToast();
  const [results, setResults] = useState<DateGroupResult[]>([]);
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

      // Myntra can split one day's returns across several files — combine
      // everything sharing a date before comparing, so file A's returns don't
      // wrongly show up as "extra" just because file B alone doesn't list
      // them. Files with no date read from their name (or several different
      // dates) each get their own group.
      const groups = new Map<string, { date: string | null; fileNames: string[]; trackingIds: string[] }>();
      for (const p of usable) {
        const key = p.date ?? `__nodate__${p.fileName}`;
        const g = groups.get(key) ?? { date: p.date, fileNames: [], trackingIds: [] };
        g.fileNames.push(p.fileName);
        g.trackingIds.push(...p.trackingIds);
        groups.set(key, g);
      }

      const checked = await Promise.all(
        [...groups.values()].map(async (g) => {
          const trackingIds = [...new Set(g.trackingIds)];
          const res = await fetch('/api/return-reports/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackingIds, date: g.date ?? undefined }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `Could not check ${g.fileNames.join(', ')}`);
          return { date: g.date, fileNames: g.fileNames, missing: data.lines as QuickCheckLine[], extra: data.extra as ExtraReturnLine[] };
        }),
      );
      setResults(checked);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read one of those files');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Quick check — upload Myntra's file (no save)">
      <div className="p-5">
        <p className="mb-3 text-sm text-neutral-500">
          Upload one or more of Myntra&apos;s return report files (.xlsx or .csv). It checks both directions —
          what Myntra says came back that you haven&apos;t logged, and what you logged that day that Myntra
          didn&apos;t mention. Nothing is saved.
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
              const missing = r.missing.filter((l) => !l.received);
              const received = r.missing.filter((l) => l.received);
              const allClear = missing.length === 0 && r.extra.length === 0;
              return (
                <div key={r.fileNames.join('|')} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.date ?? r.fileNames[0]}</span>
                    <span className="text-xs text-neutral-400">{r.fileNames.join(', ')}</span>
                    <span className="ml-auto flex flex-wrap gap-2">
                      <Badge tone="good">{received.length} matched</Badge>
                      {missing.length > 0 ? <Badge tone="danger">{missing.length} not logged</Badge> : null}
                      {r.extra.length > 0 ? <Badge tone="warn">{r.extra.length} extra</Badge> : null}
                    </span>
                  </div>

                  {allClear ? (
                    <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                      <CheckCircle2 size={15} /> Everything matches — nothing missing, nothing extra.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {missing.length > 0 ? (
                        <div>
                          <div className="mb-1 text-xs font-medium text-neutral-500">
                            In Myntra&apos;s file, but you haven&apos;t logged it as returned:
                          </div>
                          <ul className="flex flex-col gap-1">
                            {missing.map((l) => (
                              <li key={l.trackingId} className="flex items-center gap-1.5 font-mono text-xs text-red-600">
                                <AlertTriangle size={12} /> {l.trackingId}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {r.extra.length > 0 ? (
                        <div>
                          <div className="mb-1 text-xs font-medium text-neutral-500">
                            You logged these as returned that day, but they&apos;re not in Myntra&apos;s file:
                          </div>
                          <ul className="flex flex-col gap-1">
                            {r.extra.map((l) => (
                              <li key={l.trackingId} className="flex flex-wrap items-center gap-1.5 text-xs text-amber-600">
                                <HelpCircle size={12} className="shrink-0" />
                                <span className="font-mono">{l.trackingId}</span>
                                <span className="text-neutral-500 dark:text-neutral-400">
                                  — {l.qty} × {l.name}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
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
