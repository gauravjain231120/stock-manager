'use client';

import { useState, ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Wraps a block of stat numbers behind a "Show numbers" toggle. Hidden every
 * time the page loads — nothing is computed or fetched differently either
 * way, this only swaps what's rendered — so revealing or hiding again is
 * instant, pure client state with no request and no reload.
 */
export function RevealableStats({ children, className }: { children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);

  if (!shown) {
    return (
      <button
        onClick={() => setShown(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-500 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-400 dark:hover:bg-white/10 ${className ?? ''}`}
      >
        <Eye size={14} /> Show numbers
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <button
        onClick={() => setShown(false)}
        className="inline-flex w-fit items-center gap-1.5 self-start rounded-lg border border-black/15 px-2.5 py-1 text-xs font-medium text-neutral-500 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-400 dark:hover:bg-white/10"
      >
        <EyeOff size={12} /> Hide numbers
      </button>
      {children}
    </div>
  );
}
