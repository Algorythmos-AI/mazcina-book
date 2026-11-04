'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'error';
  action?: { label: string; run: () => Promise<string | null> };
}

type Show = (message: string, options?: { tone?: Toast['tone']; action?: Toast['action'] }) => void;

const ToastContext = createContext<Show>(() => {});

/** Short notes that a save worked ("Saved", "Moved to trash · Undo"), above the bottom bar on a phone. */
export function useToast(): Show {
  return useContext(ToastContext);
}

/** Lives in the root layout, so a note survives the page refreshing itself after a save. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const next = useRef(0);

  const show = useCallback<Show>((message, options = {}) => {
    setToast({ id: ++next.current, message, tone: options.tone ?? 'ok', action: options.action });
  }, []);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    // Long enough to read and reach Undo with a thumb.
    timer.current = setTimeout(() => setToast(null), toast.action ? 8000 : 4000);
    return () => clearTimeout(timer.current);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6 print:hidden">
        {toast && (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md items-center gap-4 rounded-md px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.tone === 'error' ? 'bg-red-800' : 'bg-mazcina-ink'}`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const problem = await toast.action!.run();
                  setBusy(false);
                  setToast(problem ? { id: ++next.current, message: problem, tone: 'error' } : null);
                }}
                className="min-h-11 shrink-0 rounded-sm px-3 font-bold uppercase tracking-wide text-mazcina-gold hover:bg-white/10 disabled:opacity-60"
              >
                {busy ? '…' : toast.action.label}
              </button>
            )}
            <button type="button" aria-label="Close" onClick={() => setToast(null)} className="min-h-11 min-w-8 shrink-0 text-white/70 hover:text-white">
              ✕
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
