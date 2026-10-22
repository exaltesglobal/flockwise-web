import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { ApiError } from '@/api/errors';
import { initials } from '@/lib/format';

export function Logo({ reverse = false, height = 28 }: { reverse?: boolean; height?: number }) {
  return <img src={reverse ? '/brand/logo-reverse.svg' : '/brand/logo-color.svg'} alt="Flockwise" style={{ height, width: 'auto', display: 'block' }} />;
}

export function Mark({ size = 32, reverse = false }: { size?: number; reverse?: boolean }) {
  return <img src={reverse ? '/brand/mark-reverse.svg' : '/brand/mark-color.svg'} alt="" width={size} height={size} style={{ display: 'block' }} />;
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Loading() {
  return (
    <div className="center-pad">
      <Spinner />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="empty">
      <AlertCircle size={32} />
      <div>
        <h3 style={{ color: 'var(--text)' }}>Something went wrong</h3>
        <p className="small">{error.message}</p>
      </div>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <AlertCircle size={16} />
      <span>{error.message}</span>
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div>
        <h3 style={{ color: 'var(--text)' }}>{title}</h3>
        {body && <p className="small">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, size }: { name: string; size?: 'lg' }) {
  return <span className={`avatar ${size ?? ''}`}>{initials(name)}</span>;
}

type FieldProps = { label: string; hint?: string; error?: string; children: ReactNode };
export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  side = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  side?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`overlay ${side ? 'right' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div key={i} className={`bar ${i === data.length - 1 ? 'current' : ''}`}>
          <i style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }} data-tip={format(d.value)} />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- toasts ----------

type Toast = { id: number; text: string; tone: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.tone === 'ok' ? <CheckCircle2 size={16} color="#8FD6C2" /> : <AlertCircle size={16} color="#F97066" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
