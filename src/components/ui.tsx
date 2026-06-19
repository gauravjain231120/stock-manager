import { ReactNode } from 'react';

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

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'default' | 'warn' | 'danger' | 'good' }) {
  const toneClass =
    tone === 'warn' ? 'text-amber-500' : tone === 'danger' ? 'text-red-500' : tone === 'good' ? 'text-emerald-500' : '';
  return (
    <div className={`${cardBase} p-5`}>
      <div className="text-sm text-neutral-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-neutral-400">{hint}</div> : null}
    </div>
  );
}

export function Panel({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={cardBase}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-3 dark:border-white/10">
          {title ? <h2 className="text-sm font-medium">{title}</h2> : <span />}
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

export function Td({ children, right, mono }: { children?: ReactNode; right?: boolean; mono?: boolean }) {
  return <td className={`px-5 py-2 ${right ? 'text-right tabular-nums' : ''} ${mono ? 'font-mono text-xs' : ''}`}>{children}</td>;
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-b border-black/5 last:border-0 dark:border-white/5">{children}</tr>;
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
