import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

const cardBase =
  'rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle ? <p className="text-sm text-neutral-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger' | 'good';
  icon?: LucideIcon;
}) {
  const toneClass =
    tone === 'warn' ? 'text-amber-500' : tone === 'danger' ? 'text-red-500' : tone === 'good' ? 'text-emerald-500' : '';
  const iconToneClass =
    tone === 'warn'
      ? 'bg-amber-500/10 text-amber-500'
      : tone === 'danger'
        ? 'bg-red-500/10 text-red-500'
        : tone === 'good'
          ? 'bg-emerald-500/10 text-emerald-500'
          : 'bg-brand-500/10 text-brand-600 dark:text-brand-400';
  return (
    <div className={`${cardBase} p-5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-neutral-500">{label}</div>
        {Icon ? (
          <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${iconToneClass}`}>
            <Icon size={15} />
          </div>
        ) : null}
      </div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-neutral-400">{hint}</div> : null}
    </div>
  );
}

/** A lightweight bar chart for a day-bucketed trend — pure CSS, no client JS
 *  or charting library, so it renders instantly server-side. Each bar shows
 *  its exact count in a small tooltip on hover (a native `title` attribute
 *  is too unreliable here — slow OS-dependent timing, easy to miss). */
export function TrendBars({ data }: { data: { day: string; units: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.units));
  const H = 56;
  return (
    <div>
      <div className="flex items-end gap-1 overflow-visible pt-8" style={{ height: H + 32 }}>
        {data.map((d) => {
          const h = Math.max(d.units > 0 ? 3 : 1, Math.round((d.units / max) * H));
          return (
            <div key={d.day} className="group relative flex-1" style={{ height: H }}>
              <div
                className="absolute inset-x-0 bottom-0 rounded-t bg-brand-500/70 transition-colors group-hover:bg-brand-600 dark:bg-brand-400/60"
                style={{ height: h }}
              />
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block dark:bg-white dark:text-neutral-900">
                {d.units} sold
                <div className="absolute left-1/2 top-full size-0 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-white" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1 text-[10px] text-neutral-400">
        {data.map((d) => (
          <div key={d.day} className="flex-1 text-center">
            {d.day.slice(8)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Panel({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={cardBase}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-3 dark:border-white/10">
          {title ? <h2 className="shrink-0 whitespace-nowrap text-sm font-medium">{title}</h2> : <span />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-neutral-500 dark:border-white/10">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty ? <div className="px-5 py-8 text-center text-sm text-neutral-400">Nothing here yet.</div> : null}
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return <th className={`px-5 py-2 font-medium ${right ? 'text-right' : ''}`}>{children}</th>;
}

export function Td({ children, right, mono, colSpan, className = '' }: { children?: ReactNode; right?: boolean; mono?: boolean; colSpan?: number; className?: string }) {
  return <td colSpan={colSpan} className={`px-5 py-2 ${right ? 'text-right tabular-nums' : ''} ${mono ? 'font-mono text-xs' : ''} ${className}`}>{children}</td>;
}

export function Tr({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tr className={`border-b border-black/5 last:border-0 dark:border-white/5 ${className}`}>{children}</tr>;
}

const badgeTones: Record<string, string> = {
  default: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>{children}</span>;
}
