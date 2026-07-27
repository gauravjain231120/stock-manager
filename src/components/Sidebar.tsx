'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClipboardList, Truck, PackageCheck, Undo2, Shirt, Boxes, Factory, LogOut, Menu, X } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

const NAV = [
  { href: '/register', label: 'Stock Log', Icon: ClipboardList },
  { href: '/ship', label: 'Ready to Ship', Icon: Truck },
  { href: '/shipped', label: 'Shipped', Icon: PackageCheck },
  { href: '/returns', label: 'Returns', Icon: Undo2 },
  { href: '/products', label: 'Products', Icon: Shirt },
  { href: '/inventory', label: 'Inventory', Icon: Boxes },
  { href: '/produce', label: 'Produce', Icon: Factory },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [toPack, setToPack] = useState<number | null>(null);
  const [incoming, setIncoming] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  // Live counts for the "Ready to Ship" and "Returns" badges; refresh on navigation.
  useEffect(() => {
    let on = true;
    fetch('/api/pending')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d) setToPack(d.count ?? 0); })
      .catch(() => {});
    fetch('/api/return-shipments')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d) setIncoming(d.count ?? 0); })
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
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-black/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-950 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-neutral-700 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10">
          <Menu size={22} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rangrooh-logo.png" alt="Rangrooh" className="h-6 w-auto dark:brightness-0 dark:invert" />
        {toPack ? <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">🚚 {toPack}</span> : null}
      </header>

      {/* Backdrop when the drawer is open (mobile only) */}
      {open ? <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} /> : null}

      {/* Sidebar — off-canvas drawer on mobile, docked on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-black/10 bg-white px-3 py-5 transition-transform duration-200 dark:border-white/10 dark:bg-neutral-950 md:static md:z-auto md:w-60 md:translate-x-0 md:transition-none ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-7 flex items-start justify-between px-2">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rangrooh-logo.png" alt="Rangrooh" className="h-7 w-auto dark:brightness-0 dark:invert" />
            <div className="mt-1.5 text-[11px] text-neutral-500">Stock Manager</div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-1.5 text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10 md:hidden">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, Icon }) => {
            // Exact match (or a sub-path) so /shipped doesn't also light up /ship.
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-neutral-600 hover:bg-brand-50 hover:text-brand-700 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="flex-1">{label}</span>
                {(href === '/ship' && toPack) || (href === '/returns' && incoming) ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active ? 'bg-white/20 text-white' : 'bg-brand-600 text-white'}`}>
                    {href === '/ship' ? toPack : incoming}
                  </span>
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
    </>
  );
}
