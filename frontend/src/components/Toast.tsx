'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

const STYLES: Record<ToastType, { border: string; icon: string; bg: string; color: string }> = {
  success: { border: '#34d399', icon: '✓', bg: 'rgba(52,211,153,0.08)',  color: '#34d399' },
  error:   { border: '#f87171', icon: '✕', bg: 'rgba(248,113,113,0.08)', color: '#f87171' },
  warning: { border: '#fbbf24', icon: '⚠', bg: 'rgba(251,191,36,0.08)',  color: '#fbbf24' },
  info:    { border: '#60a5fa', icon: 'ℹ', bg: 'rgba(96,165,250,0.08)',  color: '#60a5fa' },
};

function ToastEntry({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const s = STYLES[item.type];
  return (
    <div
      onClick={onDismiss}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        padding: '0.75rem 1rem',
        background: s.bg,
        border: `1px solid ${s.border}33`,
        borderLeft: `3px solid ${s.border}`,
        borderRadius: '8px',
        cursor: 'pointer',
        minWidth: '260px',
        maxWidth: '380px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        animation: 'toast-slide-in 0.22s ease',
      }}
    >
      <span style={{ color: s.color, fontWeight: 700, lineHeight: 1.5, flexShrink: 0 }}>
        {s.icon}
      </span>
      <span style={{ color: '#e2e8f0', fontSize: '0.83rem', lineHeight: 1.5 }}>
        {item.message}
      </span>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter.current;
    setItems(prev => [...prev, { id, message, type }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        {items.map(item => (
          <div key={item.id} style={{ pointerEvents: 'auto' }}>
            <ToastEntry item={item} onDismiss={() => dismiss(item.id)} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
