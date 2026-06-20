'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardList, Shirt, Boxes, LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

const NAV = [
  { href: '/register', label: 'Stock Log', Icon: ClipboardList },
  { href: '/products', label: 'Products', Icon: Shirt },
  { href: '/inventory', label: 'Inventory', Icon: Boxes },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // No sidebar on the login screen.
  if (pathname === '/login') return null;

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-black/10 bg-white px-3 py-5 dark:border-white/10 dark:bg-neutral-950">
      <div className="mb-7 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rangrooh-logo.png" alt="Rangrooh" className="h-7 w-auto dark:brightness-0 dark:invert" />
        <div className="mt-1.5 text-[11px] text-neutral-500">Stock Manager</div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-brand-50 hover:text-brand-700 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white'
              }`}
            >
              <Icon size={18} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 pt-4">
        <ThemeToggle />
        <button
          onClick={logout}
          title="Log out"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <LogOut size={18} className="shrink-0" />
          Log out
        </button>
      </div>
    </aside>
  );
}
