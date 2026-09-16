import React, { createContext, useCallback, useContext, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

const LED_CLASS: Record<ToastKind, string> = {
  success: 'led-green',
  info: 'led-amber',
  error: 'led-red',
};

/**
 * Lightweight in-popup toast system. Replaces window.alert() calls, which
 * block the extension's event loop and look out of place in a styled UI.
 * Rendered as small deck indicator strips (LED + message) rather than
 * generic colored banners, to stay in the cassette-deck vocabulary.
 */
export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-2 left-2 right-2 flex flex-col gap-1.5 z-50 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="cassette-shell flex items-center gap-2 text-[11px] font-medium px-3 py-2 rounded-lg text-zinc-200"
          >
            <span className={`led ${LED_CLASS[toast.kind]} led-pulse`} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Hook is intentionally co-located with its provider above.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
