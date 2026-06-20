'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  description?: string;
  details?: { label: string; value: string }[];
  confirmLabel?: string;
  tone?: 'default' | 'danger';
}

const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** await confirm({ title, details, ... }) -> true if the user confirms. */
export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [, setResolver] = useState<{ fn: (ok: boolean) => void } | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => setResolver({ fn: resolve }));
  }, []);

  const close = useCallback((ok: boolean) => {
    setResolver((r) => {
      r?.fn(ok);
      return null;
    });
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [opts, close]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => close(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-neutral-900"
          >
            <h3 className="text-base font-semibold">{opts.title}</h3>
            {opts.description ? <p className="mt-1 text-sm text-neutral-500">{opts.description}</p> : null}

            {opts.details && opts.details.length ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
                {opts.details.map((d, i) => (
                  <div key={i} className="flex justify-between gap-4 border-b border-black/5 px-3 py-1.5 text-sm last:border-0 dark:border-white/5">
                    <span className="text-neutral-500">{d.label}</span>
                    <span className="text-right font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white ${
                  opts.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {opts.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmCtx.Provider>
  );
}
