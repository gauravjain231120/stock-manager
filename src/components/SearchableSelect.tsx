'use client';

import { useEffect, useRef, useState } from 'react';
import { matchesSearch } from '@/lib/format';

export interface Option {
  value: string;
  label: string;
}

/**
 * A type-to-filter dropdown (combobox). Click to open, type to search, use the
 * ↑/↓ arrow keys to move and Enter to pick (or click). Keeps the picker usable
 * when there are many products.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value);
  // Word match ("halter blue") or punctuation-free SKU match ("rrc006cofbluxl").
  const filtered = query.trim() ? options.filter((o) => matchesSearch(o.label, query, o.value)) : options;
  const activeIdx = Math.min(active, Math.max(0, filtered.length - 1));

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 dark:border-white/20 dark:text-white dark:placeholder-neutral-500"
        value={open ? query : selected?.label ?? ''}
        placeholder={selected ? selected.label : placeholder}
        onFocus={() => {
          setOpen(true);
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const opt = filtered[activeIdx];
            if (opt) pick(opt.value);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setQuery('');
          }
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-neutral-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
          ) : (
            filtered.map((o, i) => (
              <button
                type="button"
                key={o.value}
                ref={i === activeIdx ? activeRef : null}
                onClick={() => pick(o.value)}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-2 text-left text-sm text-neutral-800 dark:text-neutral-100 ${
                  i === activeIdx
                    ? 'bg-brand-50 text-brand-700 dark:bg-white/15 dark:text-white'
                    : o.value === value
                      ? 'bg-black/5 dark:bg-white/10'
                      : ''
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
