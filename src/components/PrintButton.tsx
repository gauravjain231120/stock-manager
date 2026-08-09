'use client';

import { useEffect } from 'react';
import { Printer } from 'lucide-react';

/**
 * Hands the sheet to the browser's print dialog, where "Save as PDF" is the
 * destination. No PDF library involved — the page's own print stylesheet is
 * the layout, so what you see is what lands in the file.
 *
 * With `auto` it fires on load (the Ready-to-Ship button links in that way, so
 * one click gets you the dialog), but only once fonts have settled — printing
 * mid-reflow gives you a preview of a half-laid-out table.
 */
export function PrintButton({ auto = false, label = 'Save as PDF' }: { auto?: boolean; label?: string }) {
  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    const print = () => {
      if (!cancelled) window.print();
    };
    const fonts = document.fonts?.ready;
    if (fonts) fonts.then(print);
    else print();
    return () => {
      cancelled = true;
    };
  }, [auto]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
    >
      <Printer size={14} />
      {label}
    </button>
  );
}
