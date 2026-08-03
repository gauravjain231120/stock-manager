'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { EllipsisVertical } from 'lucide-react';

export const menuItemCls =
  'block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10';

/**
 * The "⋯" menu that holds a row's secondary actions, keeping the busy actions
 * (Ship, Produce) as the only buttons on show.
 *
 * The panel is position:fixed rather than absolute on purpose — the table scrolls
 * horizontally (`overflow-x-auto`), which would clip an absolutely-positioned
 * dropdown. Fixed elements aren't clipped by an ancestor's overflow, so it's
 * placed from the trigger's screen position instead.
 *
 * Anything that opens a dialog must live OUTSIDE this menu (see PendingRowActions):
 * the panel unmounts as soon as the menu closes, which would take the dialog with it.
 */
export function RowMenu({ children, label = 'More actions' }: { children: (close: () => void) => ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // The panel is pinned to the viewport, so it can't follow a scroll — close it.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    setOpen(true);
  }

  return (
    <div ref={wrapRef} className="inline-block">
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className="rounded-lg border border-black/15 px-2 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        <EllipsisVertical size={16} />
      </button>

      {open && pos ? (
        <div
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-40 w-36 rounded-xl border border-black/10 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-neutral-900"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
