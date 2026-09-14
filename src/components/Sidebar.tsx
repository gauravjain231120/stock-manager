'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  PackageCheck,
  Undo2,
  Shirt,
  Boxes,
  Factory,
  NotebookPen,
  Wallet,
  Users,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { sectionsForRole, type Role } from '@/lib/permissions';

const ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/register': ClipboardList,
  '/notes': NotebookPen,
  '/ship': Truck,
  '/shipped': PackageCheck,
  '/returns': Undo2,
  '/products': Shirt,
  '/inventory': Boxes,
  '/produce': Factory,
  '/account': Wallet,
  '/team': Users,
};

export function Sidebar({
  currentUser,
}: {
  currentUser: { username: string; role: Role; allowedSections: string[] } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [toPack, setToPack] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const nav = currentUser ? sectionsForRole(currentUser.role, currentUser.allowedSections) : [];
  const canShip = nav.some((s) => s.href === '/ship');

  // Live count for the "Ready to Ship" badge; refreshes when the page changes.
  // Skipped entirely for a role without Ready to Ship — that call would just
  // be blocked (403) by middleware anyway.
  useEffect(() => {
    if (!canShip) return;
    let on = true;
    fetch('/api/pending')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d) setToPack(d.count ?? 0); })
      .catch(() => {});
    return () => { on = false; };
  }, [pathname, canShip]);

  // No sidebar on the login screen.
  if (pathname === '/login' || !currentUser) return null;

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-black/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-950 md:hidden">
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
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-black/10 bg-white px-3 py-5 transition-transform duration-200 dark:border-white/10 dark:bg-neutral-950 md:static md:z-auto md:w-60 md:translate-x-0 md:transition-none ${open ? 'translate-x-0' : '-translate-x-full'}`}
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
          {nav.map(({ href, label }) => {
            const Icon = ICONS[href] ?? ClipboardList;
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
                {href === '/ship' && toPack ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active ? 'bg-white/20 text-white' : 'bg-brand-600 text-white'}`}>{toPack}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1 pt-4">
          <div className="px-3 pb-1 text-xs text-neutral-400">{currentUser.username}</div>
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
