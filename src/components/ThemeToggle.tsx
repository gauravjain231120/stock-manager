'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Read the current theme (set by the inline script in layout) after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  function toggle() {
    const isDark = document.documentElement.classList.toggle('dark');
    setDark(isDark);
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      title="Toggle dark mode"
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
    >
      {dark ? <Sun size={18} className="shrink-0" /> : <Moon size={18} className="shrink-0" />}
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
