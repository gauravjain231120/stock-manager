'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

const input =
  'w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:border-white/20 dark:text-white';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // The first section THIS account can actually see — a Viewer without
        // Stock Log granted shouldn't land on a page middleware immediately
        // bounces them off of.
        router.replace(data?.redirectTo || '/register');
        router.refresh();
      } else {
        setErr('Wrong username or password');
        setBusy(false);
      }
    } catch {
      setErr('Something went wrong, try again');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-neutral-900"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rangrooh-logo.png" alt="Rangrooh" className="mx-auto mb-1 h-8 w-auto dark:brightness-0 dark:invert" />
        <div className="mb-6 text-center text-xs text-neutral-500">Stock Manager — please log in</div>

        {err ? (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {err}
          </div>
        ) : null}

        <label className="mb-3 block text-xs text-neutral-500">
          Username
          <input className={`${input} mt-1`} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </label>
        <label className="mb-5 block text-xs text-neutral-500">
          Password
          <div className="relative mt-1">
            <input
              className={`${input} pr-10`}
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              title={showPass ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <button
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
