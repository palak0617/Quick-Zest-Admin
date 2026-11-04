'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
              t.type === 'error' ? 'bg-red-600 text-white' : 'bg-stone-900 text-white'
            }`}
          >
            {t.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} className="text-emerald-400" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-base font-semibold text-stone-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Layout bits ---------- */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  default: 'text-stone-900',
  green: 'text-emerald-700',
  red: 'text-red-600',
  brand: 'text-brand-700',
};

export function Stat({ label, value, hint, icon: Icon, tone = 'default' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-stone-500">{label}</p>
        {Icon && <Icon size={16} className="text-stone-400" />}
      </div>
      <p className={`num mt-2 text-xl font-semibold tracking-tight sm:text-2xl ${TONES[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

const BADGE = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  processing: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  shipped: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  cancelled: 'bg-stone-100 text-stone-500 ring-stone-500/20',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  partial: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  unpaid: 'bg-red-50 text-red-700 ring-red-600/20',
  low: 'bg-red-50 text-red-700 ring-red-600/20',
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  neutral: 'bg-stone-100 text-stone-600 ring-stone-500/20',
};

export function Badge({ tone, children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${BADGE[tone] || BADGE.neutral}`}>
      {children}
    </span>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`animate-spin text-stone-400 ${className}`} size={20} />;
}

export function Loading() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-600">
          <Icon size={22} />
        </div>
      )}
      <p className="font-medium text-stone-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-stone-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Table wrapper that scrolls sideways on small screens */
export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-stone-100">
        <thead className="bg-stone-50/70">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-stone-100">{children}</tbody>
      </table>
    </div>
  );
}

/** Simple "are you sure" helper */
export const confirmAction = (msg) => typeof window !== 'undefined' && window.confirm(msg);
