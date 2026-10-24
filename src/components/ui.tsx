import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { ApiError } from '@/api/errors';
import { DrawnAvatar, avatarFor } from '@/components/avatars';
import { useFace } from '@/lib/faces';

export function Logo({ reverse = false, height = 28 }: { reverse?: boolean; height?: number }) {
  const src = (v: 'color' | 'reverse') => `${import.meta.env.BASE_URL}brand/logo-${v}.svg`;
  const style = { height, width: 'auto' };
  // On dark surfaces use the reverse logo. Without `reverse`, follow the page theme.
  if (reverse) return <img src={src('reverse')} alt="Flockwise" style={{ ...style, display: 'block' }} />;
  return (
    <span className="logo-adaptive">
      <img className="logo-on-light" src={src('color')} alt="Flockwise" style={style} />
      <img className="logo-on-dark" src={src('reverse')} alt="Flockwise" style={style} />
    </span>
  );
}

export function Mark({ size = 32, reverse = false }: { size?: number; reverse?: boolean }) {
  return <img src={`${import.meta.env.BASE_URL}brand/mark-${reverse ? 'reverse' : 'color'}.svg`} alt="" width={size} height={size} style={{ display: 'block' }} />;
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

/** The Flockwise mark turning slowly: the saffron dot circles the ring while a page loads. */
export function Loading() {
  return (
    <div className="center-pad" role="status" aria-label="Loading">
      <span className="brand-loader"><Mark size={34} /></span>
    </div>
  );
}

/** A plain heading for an error, so people know whether to wait, retry or ask someone. */
function errorTitle(error: ApiError) {
  if (error.code === 'offline') return 'Not available in demo mode';
  if (error.code === 'network') return 'Could not connect';
  if (error.code === 'timeout') return 'This is taking too long';
  if (error.status === 401) return 'Please sign in again';
  if (error.status === 403) return 'You do not have access to this';
  if (error.status === 404) return 'Not found';
  if (error.status === 402) return 'Not on your plan';
  return 'Something went wrong';
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="empty">
      <AlertCircle size={32} />
      <div>
        <h3 style={{ color: 'var(--text)' }}>{errorTitle(error)}</h3>
        <p className="small">{error.message}</p>
      </div>
      {onRetry && ![401, 402, 403, 404].includes(error.status) && error.code !== 'offline' && (
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
      {icon ?? <span className="empty-mark"><Mark size={40} /></span>}
      <div>
        <h3 style={{ color: 'var(--text)' }}>{title}</h3>
        {body && <p className="small">{body}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * A person's face: their photo, or else one of the 100 drawn avatars (the one they picked, or one
 * chosen from their id so it never changes). Pass `person` when you have it; `name` alone still works.
 */
export function Avatar({ name, size, person, photo, avatar, id }: { name: string; size?: 'lg' | 'xl' | 'sm'; person?: { id?: string; photoUrl?: string | null; avatar?: number | null }; photo?: string | null; avatar?: number | null; id?: string | null }) {
  const pid = id ?? person?.id;
  const face = useFace(pid ?? undefined);
  const url = photo ?? person?.photoUrl ?? face?.p ?? null;
  const [broken, setBroken] = useState(false);
  if (url && !broken) return <span className={`avatar photo ${size ?? ''}`} title={name}><img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /></span>;
  const n = avatar ?? person?.avatar ?? face?.a ?? avatarFor(pid || name || '');
  return <span className={`avatar drawn ${size ?? ''}`} title={name}><DrawnAvatar n={n} /></span>;
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
  wide = false,
  xl = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  side?: boolean;
  wide?: boolean;
  /** Nearly the full screen, for editors. */
  xl?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`overlay ${side ? 'right' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''} ${xl ? 'xl' : ''}`} role="dialog" aria-modal="true">
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

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; text: string; tone: 'ok' | 'error'; action?: ToastAction };
type Push = (text: string, tone?: Toast['tone'], action?: ToastAction, ms?: number) => void;
const ToastCtx = createContext<Push>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Push>((text, tone = 'ok', action, ms) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms ?? (action ? 8000 : 3200));
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.tone === 'ok' ? <CheckCircle2 size={16} color="#8FD6C2" /> : <AlertCircle size={16} color="#F97066" />}
            {t.text}
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/**
 * Delete with Undo instead of "Are you sure?": the row disappears at once, a toast offers Undo for
 * 8 seconds, and only then is the delete sent. `hide`/`show` hide and bring back the row on the page.
 */
// Deletes still waiting out their Undo window. If the page is closed or reloaded first, they run
// straight away, so a removed item does not come back on the next visit.
const pendingDeletes = new Set<() => void>();
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { for (const run of [...pendingDeletes]) run(); });

export function useUndoableDelete() {
  const toast = useToast();
  return useCallback(
    (o: { text: string; run: () => Promise<unknown>; hide: () => void; show: () => void; done?: () => void; undoLabel?: string; failText?: string }) => {
      o.hide();
      const go = () => {
        pendingDeletes.delete(go);
        clearTimeout(timer);
        o.run().then(
          () => o.done?.(),
          () => { o.show(); toast(o.failText ?? 'Could not delete that. It is back.', 'error'); },
        );
      };
      const timer = setTimeout(go, 8000);
      pendingDeletes.add(go);
      toast(o.text, 'ok', { label: o.undoLabel ?? 'Undo', onClick: () => { pendingDeletes.delete(go); clearTimeout(timer); o.show(); } });
    },
    [toast],
  );
}

/** Rows hidden while their delete waits for Undo. */
export function useHiddenRows() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  return {
    hidden,
    hide: (id: string) => setHidden((h) => new Set(h).add(id)),
    show: (id: string) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; }),
  };
}
