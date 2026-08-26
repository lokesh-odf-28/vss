'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

type ConfirmState = ConfirmOptions & { resolve: (v: boolean) => void };

type ConfirmApi = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmApi | null>(null);

/** Drop-in replacement for window.confirm(...) — a custom modal instead of
 * the browser's native prompt. Resolves true/false like confirm() did. */
export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmApi>((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setState((prev) => {
      prev?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => close(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xl animate-slide-up">
            {state.title && <h2 className="text-sm font-semibold mb-1.5">{state.title}</h2>}
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{state.message}</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-md border border-neutral-200 dark:border-neutral-700 px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-[0.98]"
              >
                {state.cancelLabel ?? 'Cancel'}
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={() => close(true)}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold text-white transition-colors active:scale-[0.98] ${
                  state.tone === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-700 hover:bg-blue-800'
                }`}
              >
                {state.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
