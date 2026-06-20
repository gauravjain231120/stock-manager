'use client';

import { useEffect, useRef, useState } from 'react';

export interface Option {
  value: string;
  label: string;
}

/**
 * A type-to-filter dropdown (combobox). Click to open, type to search, click or
 * press Enter to pick. Keeps the picker usable when there are many products.
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
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

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
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery('');
          } else if (e.key === 'Enter' && filtered.length) {
            e.preventDefault();
            pick(filtered[0].value);
          }
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-neutral-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => pick(o.value)}
                className={`block w-full px-3 py-2 text-left text-sm text-neutral-800 hover:bg-black/5 dark:text-neutral-100 dark:hover:bg-white/10 ${
                  o.value === value ? 'bg-black/5 dark:bg-white/10' : ''
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
