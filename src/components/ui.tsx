import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X, AlertOctagon } from 'lucide-react';
import { classNames } from '@/lib/format';

export function StatusBadge({ status, tone = 'neutral' }: { status?: string | null; tone?: BadgeTone }) {
  const safeStatus = String(status ?? '').replace(/_/g, ' ') || '-';
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200',
    danger: 'bg-rose-50 text-rose-700 ring-rose-200',
    info: 'bg-sky-50 text-sky-700 ring-sky-200',
    brand: 'bg-blue-50 text-blue-700 ring-blue-200',
  };
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset',
        tones[tone],
      )}
    >
      {safeStatus}
    </span>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-slate-300">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…', message }: { label?: string; message?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      <span className="text-sm">{message || label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-6 py-12 text-center">
      <h3 className="text-sm font-semibold text-rose-700">Something went wrong</h3>
      <p className="mt-1 max-w-md text-sm text-rose-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700">
          Try again
        </button>
      )}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600 shadow-sm',
    secondary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
    ghost: 'text-slate-700 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    warning: 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  return (
    <button
      type={type}
      className={classNames(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  return <div onClick={onClick} className={classNames('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>{children}</div>;
}

export function AIDisclaimer({ className }: { className?: string }) {
  return (
    <div className={classNames("flex items-start gap-2 rounded-md bg-indigo-50/50 p-3 text-xs text-indigo-700/80 border border-indigo-100/50", className)}>
      <AlertOctagon className="h-4 w-4 shrink-0 text-indigo-500/70 mt-0.5" />
      <p>
        <strong>AI Assistant Note:</strong> AI can make mistakes or hallucinate information. 
        Always carefully review and verify generated content before saving or sending it to clients.
      </p>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, required, error, hint, children }: { label: ReactNode; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classNames(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classNames(inputClass, 'min-h-[80px]', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={classNames(inputClass, 'appearance-none', props.className)} />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  preventEscape = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  preventEscape?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventEscape) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, preventEscape]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
      <div
        onClick={(e) => e.stopPropagation()}
        className={classNames('relative w-full rounded-xl bg-white shadow-xl', widths[size])}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-slate-600">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Toast({ message, tone = 'info', onDismiss }: { message: string; tone?: 'info' | 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const tones = {
    info: 'bg-slate-900 text-white',
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
  };
  return (
    <div className="fixed bottom-4 right-4 z-[60] animate-in">
      <div className={classNames('rounded-lg px-4 py-3 text-sm shadow-lg', tones[tone])}>{message}</div>
    </div>
  );
}
