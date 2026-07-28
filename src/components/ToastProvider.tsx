'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, XCircle, Undo2 } from 'lucide-react';

type ToastType = 'success' | 'error';
interface ToastAction { label: string; onClick: () => void }
interface Toast { id: number; type: ToastType; message: string; action?: ToastAction }
interface ToastOptions {
  /** A button inside the toast, e.g. Undo. Dismisses the toast when clicked. */
  action?: ToastAction;
  /** How long the toast stays up. Defaults to 3s, or 10s when it has an action. */
  durationMs?: number;
}

const ToastCtx = createContext<{
  success: (m: string, o?: ToastOptions) => void;
  error: (m: string, o?: ToastOptions) => void;
}>({
  success: () => {},
  error: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string, opts?: ToastOptions) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, type, message, action: opts?.action }]);
    const ms = opts?.durationMs ?? (opts?.action ? 10_000 : 3000);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const api = {
    success: (m: string, o?: ToastOptions) => push('success', m, o),
    error: (m: string, o?: ToastOptions) => push('error', m, o),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            <span className="flex items-center gap-2">
              {t.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              {t.message}
            </span>
            {t.action ? (
              <button
                onClick={() => { t.action?.onClick(); dismiss(t.id); }}
                className="flex items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/30"
              >
                <Undo2 size={13} /> {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
