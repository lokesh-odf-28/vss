'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Drop-in replacement for alert(...) — a dismissable, auto-expiring toast
 * stack instead of a blocking native dialog. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const api = useRef<ToastApi>({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            className={`animate-slide-up cursor-pointer rounded-lg border px-3.5 py-2.5 text-sm shadow-lg backdrop-blur-sm ${toneCls(t.tone)}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function toneCls(tone: ToastTone): string {
  if (tone === 'error') {
    return 'bg-red-50/95 text-red-700 border-red-200 dark:bg-red-950/95 dark:text-red-300 dark:border-red-900';
  }
  if (tone === 'success') {
    return 'bg-emerald-50/95 text-emerald-700 border-emerald-200 dark:bg-emerald-950/95 dark:text-emerald-300 dark:border-emerald-900';
  }
  return 'bg-neutral-50/95 text-neutral-700 border-neutral-200 dark:bg-neutral-900/95 dark:text-neutral-300 dark:border-neutral-800';
}
