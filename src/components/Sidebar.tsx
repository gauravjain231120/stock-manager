'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClipboardList, Truck, Shirt, Boxes, Factory, LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

const NAV = [
  { href: '/register', label: 'Stock Log', Icon: ClipboardList },
  { href: '/ship', label: 'Ready to Ship', Icon: Truck },
  { href: '/products', label: 'Products', Icon: Shirt },
  { href: '/inventory', label: 'Inventory', Icon: Boxes },
  { href: '/produce', label: 'Produce', Icon: Factory },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [toPack, setToPack] = useState<number | null>(null);

  // Live count for the "Ready to Ship" badge; refreshes when the page changes.
  useEffect(() => {
    let on = true;
    fetch('/api/pending')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d) setToPack(d.count ?? 0); })
      .catch(() => {});
    return () => { on = false; };
  }, [pathname]);

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
              <span className="flex-1">{label}</span>
              {href === '/ship' && toPack ? (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active ? 'bg-white/20 text-white' : 'bg-brand-600 text-white'}`}>{toPack}</span>
              ) : null}
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
