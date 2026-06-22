'use client';

import { useEffect } from 'react';

/**
 * Re-applies the saved theme after hydration, as a safety net in case React
 * strips the class the inline anti-flash script set on <html>. Renders nothing.
 */
export function ThemeManager() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    } catch {}
  }, []);
  return null;
}
