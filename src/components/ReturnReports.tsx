'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Panel, Badge } from '@/components/ui';
import { ActionButton } from '@/components/ActionButton';
import { useToast } from '@/components/ToastProvider';
import { dateOnly } from '@/lib/format';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';
import type { ReportView } from '@/lib/returnReports';

const input = 'rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

function platformLabel(c: string | null) {
  if (!c) return 'No platform';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

/** Spells out what the server dropped: numbers already on another report, or too long. */
function skipNote(data: { duplicates?: { trackingId: string; where: string }[]; skipped?: string[] }) {
  const parts: string[] = [];
  const d = data.duplicates?.length ?? 0;
  const s = data.skipped?.length ?? 0;
  if (d) parts.push(`${d} already on another report (${data.duplicates![0].trackingId}…)`);
  if (s) parts.push(`${s} too long`);
  return parts.length ? ` — skipped ${parts.join(', ')}` : '';
}

/**
 * Marketplace return reports: paste the tracking numbers a platform says are
 * coming back, then see which actually arrived. Missing ones stay listed until
 * they turn up (the check re-runs on every page load) or you mark them claimed.
 */
export function ReturnReports({ reports, today }: { reports: ReportView[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // The whole section starts collapsed — it's a reference list, not daily work.
  const [showSection, setShowSection] = useState(false);
  const [platform, setPlatform] = useState<Platform>('MYNTRA');
  const [date, setDate] = useState(today);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(reports[0]?.id ?? null);

  // Editing an existing report: its id plus the working copy of its fields.
  const [editId, setEditId] = useState<string | null>(null);
  const [eText, setEText] = useState('');
  const [ePlatform, setEPlatform] = useState<Platform>('MYNTRA');
  const [eDate, setEDate] = useState('');

  function startEdit(r: ReportView) {
    setEditId(r.id);
    setEText(r.lines.map((l) => l.trackingId).join('\n'));
    setEPlatform((r.platform as Platform) ?? 'MYNTRA');
    setEDate(r.reportDate.slice(0, 10));
  }

  async function saveEdit(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/return-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: eText, platform: ePlatform, date: eDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Could not save');
      else {
        toast.success(`Report updated — ${data.total} tracking numbers ✓${skipNote(data)}`);
        setEditId(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const typedCount = new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)).size;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/return-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, date, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data?.error || 'Could not save');
      else {
        toast.success(`Saved ${data.added} tracking number${data.added === 1 ? '' : 's'} ✓${skipNote(data)}`);
        setText('');
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleSettled(reportId: string, trackingId: string, settled: boolean) {
    const res = await fetch(`/api/return-reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingId, settled }),
    });
    if (!res.ok) toast.error('Could not update');
    else {
      toast.success(settled ? 'Marked claimed ✓' : 'Back to outstanding');
      router.refresh();
    }
  }

  const totalMissing = reports.reduce((a, r) => a + r.missing, 0);
  const totalLines = reports.reduce((a, r) => a + r.total, 0);

  return (
    <Panel
      title="Return reports — what the platform sent vs what arrived"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {!showSection ? (
            <span className="text-sm text-neutral-500">
              {reports.length} report{reports.length === 1 ? '' : 's'} · {totalLines} tracking number{totalLines === 1 ? '' : 's'}
              {totalMissing > 0 ? <span className="text-red-500"> · {totalMissing} not received</span> : null}
            </span>
          ) : null}
          <button
            onClick={() => setShowSection((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showSection ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {showSection ? 'Hide' : 'Show details'}
          </button>
          {showSection ? (
            <button
              onClick={() => { setDate(today); setOpen((v) => !v); }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus size={15} /> {open ? 'Close' : 'Add report'}
            </button>
          ) : null}
        </div>
      }
    >
      {!showSection ? null : (
        <>
      {open ? (
        <form onSubmit={save} className="border-b border-black/10 px-5 py-4 dark:border-white/10">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Platform
              <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Report date
              <input className={input} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <span className="pb-2 text-xs text-neutral-400">{typedCount} tracking number{typedCount === 1 ? '' : 's'} entered</span>
          </div>

          <label className="mt-3 flex flex-col gap-1 text-xs text-neutral-500">
            Paste every tracking number from the report — one per line (you can also scan them in)
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={'77123456789\nMYEP1129227758\n371237601781'}
              className={`${input} font-mono`}
            />
          </label>

          <div className="mt-3 flex justify-end">
            <button disabled={busy || typedCount === 0} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? 'Saving…' : `Save ${typedCount || ''} number${typedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      ) : null}

      {reports.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-neutral-400">
          No reports saved yet. Add one to check a platform&apos;s list against what actually arrived.
        </div>
      ) : (
        <div className="divide-y divide-black/5 dark:divide-white/5">
          {reports.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <div key={r.id}>
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                >
                  <span className="font-medium">{platformLabel(r.platform)}</span>
                  <span className="text-sm text-neutral-500">{dateOnly(r.reportDate)}</span>
                  <span className="text-sm text-neutral-500">{r.total} in report</span>
                  <span className="ml-auto flex items-center gap-2">
                    <Badge tone="good">{r.received} received</Badge>
                    {r.missing > 0 ? <Badge tone="danger">{r.missing} not received</Badge> : null}
                    {r.settled > 0 ? <Badge>{r.settled} claimed</Badge> : null}
                  </span>
                </button>

                {isOpen && editId === r.id ? (
                  <div className="border-t border-black/10 px-5 py-4 dark:border-white/10">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1 text-xs text-neutral-500">
                        Platform
                        <select className={input} value={ePlatform} onChange={(e) => setEPlatform(e.target.value as Platform)}>
                          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-neutral-500">
                        Report date
                        <input className={input} type="date" max={today} value={eDate} onChange={(e) => setEDate(e.target.value)} />
                      </label>
                    </div>
                    <label className="mt-3 flex flex-col gap-1 text-xs text-neutral-500">
                      Add, correct or remove tracking numbers — one per line
                      <textarea value={eText} onChange={(e) => setEText(e.target.value)} rows={8} className={`${input} font-mono`} />
                    </label>
                    <p className="mt-2 text-[11px] text-neutral-400">Lines you already marked claimed stay claimed if they&apos;re still in the list.</p>
                    <div className="mt-3 flex justify-end gap-2">
                      <button onClick={() => setEditId(null)} className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                        Cancel
                      </button>
                      <button onClick={() => saveEdit(r.id)} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                        {busy ? 'Saving…' : 'Save report'}
                      </button>
                    </div>
                  </div>
                ) : isOpen ? (
                  <div className="px-5 pb-4">
                    <div className="mb-3 flex justify-end gap-2">
                      <button
                        onClick={() => startEdit(r)}
                        className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                      >
                        Edit report
                      </button>
                      <ActionButton
                        label="Delete report"
                        endpoint={`/api/return-reports/${r.id}`}
                        method="DELETE"
                        variant="danger"
                        confirmTitle="Delete this report?"
                        confirm="The tracking list is removed. Returns already logged are not affected."
                        confirmDetails={[
                          { label: 'Report', value: `${platformLabel(r.platform)} · ${dateOnly(r.reportDate)}` },
                          { label: 'Tracking numbers', value: String(r.total) },
                        ]}
                        confirmLabel="Delete"
                        successMessage="Report deleted"
                      />
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {r.lines.map((l) => (
                        <li
                          key={l.trackingId}
                          className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                            l.received ? 'bg-emerald-500/10' : l.settled ? 'bg-black/5 dark:bg-white/5' : 'bg-red-500/10'
                          }`}
                        >
                          {l.received ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertTriangle size={15} className={l.settled ? 'text-neutral-400' : 'text-red-600'} />}
                          <span className="font-mono text-xs">{l.trackingId}</span>
                          {l.received ? (
                            <>
                              <span className="text-neutral-600 dark:text-neutral-300">{l.qty} × {l.name}</span>
                              <span className="text-xs text-neutral-400">logged {dateOnly(l.loggedAt)}</span>
                              {l.partial ? <Badge tone="warn">part match</Badge> : null}
                            </>
                          ) : (
                            <span className={l.settled ? 'text-neutral-500' : 'text-red-600'}>
                              {l.settled ? 'claimed / written off' : 'not received'}
                            </span>
                          )}
                          {!l.received ? (
                            <button
                              onClick={() => toggleSettled(r.id, l.trackingId, !l.settled)}
                              className="ml-auto rounded-lg border border-black/15 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                            >
                              {l.settled ? 'Mark outstanding' : 'Mark claimed'}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </Panel>
  );
}
