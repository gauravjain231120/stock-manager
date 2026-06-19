'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/register', label: 'Stock Log' },
  { href: '/products', label: 'Products' },
  { href: '/inventory', label: 'Inventory' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-black/10 bg-white px-3 py-5 dark:border-white/10 dark:bg-neutral-950">
      <div className="px-2 pb-5">
        <div className="text-lg font-bold">Stock Manager</div>
        <div className="text-xs text-neutral-500">Simple stock tracking</div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
