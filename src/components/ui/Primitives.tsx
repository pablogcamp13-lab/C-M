import React, { forwardRef, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Search, X, XCircle } from 'lucide-react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'primary', size = 'md', leadingIcon, trailingIcon, loading, className, children, disabled, ...props }, ref) => (
  <button ref={ref} className={clsx('cm-button', `cm-button--${variant}`, `cm-button--${size}`, className)} disabled={disabled || loading} {...props}>
    {loading ? <Spinner size="sm" /> : leadingIcon}
    <span>{children}</span>
    {!loading && trailingIcon}
  </button>
));
Button.displayName = 'Button';

export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }>(({ label, size = 'md', className, children, ...props }, ref) => (
  <button ref={ref} aria-label={label} title={label} className={clsx('cm-icon-button', `cm-icon-button--${size}`, className)} {...props}>{children}</button>
));
IconButton.displayName = 'IconButton';

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export const Badge: React.FC<React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant; dot?: boolean }> = ({ variant = 'neutral', dot, className, children, ...props }) => (
  <span className={clsx('cm-badge', `cm-badge--${variant}`, className)} {...props}>{dot && <i aria-hidden="true" />}{children}</span>
);

export const Card: React.FC<React.HTMLAttributes<HTMLElement> & { as?: 'article' | 'section' | 'div'; interactive?: boolean; variant?: 'default' | 'elevated' | 'interactive' | 'highlight' }> = ({ as: Tag = 'article', interactive, variant = 'default', className, ...props }) => <Tag className={clsx('cm-card', `cm-card--${interactive ? 'interactive' : variant}`, className)} {...props} />;
export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement> & { title: string; description?: string; action?: React.ReactNode }> = ({ title, description, action, className, ...props }) => <div className={clsx('cm-card-header', className)} {...props}><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => <div className={clsx('cm-card-content', className)} {...props} />;
export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => <div className={clsx('cm-card-footer', className)} {...props} />;

export const KpiCard: React.FC<{ label: string; value: React.ReactNode; detail?: React.ReactNode; icon?: React.ReactNode; trend?: React.ReactNode; status?: BadgeVariant; loading?: boolean; className?: string }> = ({ label, value, detail, icon, trend, status, loading, className }) => (
  <Card className={clsx('cm-kpi-card', className)}><div className="cm-kpi-card__top"><span>{label}</span>{icon && <i>{icon}</i>}</div>{loading ? <Skeleton className="mt-3 h-7 w-24" /> : <strong>{value}</strong>}<div className="cm-kpi-card__detail"><span>{detail}</span>{status && <Badge variant={status} dot>{status}</Badge>}{trend}</div></Card>
);

export const PageHeader: React.FC<{ eyebrow?: string; title: string; description?: string; breadcrumbs?: string[]; actions?: React.ReactNode; context?: React.ReactNode; filters?: React.ReactNode }> = ({ eyebrow, title, description, breadcrumbs, actions, context, filters }) => (
  <header className="cm-page-header"><div className="min-w-0">{breadcrumbs?.length ? <nav aria-label="Migas de pan" className="cm-breadcrumbs">{breadcrumbs.map((item, index) => <React.Fragment key={`${item}-${index}`}><span>{item}</span>{index < breadcrumbs.length - 1 && <b>/</b>}</React.Fragment>)}</nav> : eyebrow && <p className="cm-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="cm-page-header__description">{description}</p>}{context}</div>{(actions || filters) && <div className="cm-page-header__actions">{filters}{actions}</div>}</header>
);

export const Field: React.FC<{ label: string; htmlFor?: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode; className?: string }> = ({ label, htmlFor, hint, error, required, children, className }) => <div className={clsx('cm-field', className)}><label htmlFor={htmlFor} className="cm-field__label">{label}{required && <span aria-hidden="true"> *</span>}</label>{children}{error ? <p className="cm-field__error">{error}</p> : hint && <p className="cm-field__hint">{hint}</p>}</div>;
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={clsx('cm-input', className)} {...props} />); Input.displayName = 'Input';
export const SearchInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <span className="cm-search-input"><Search aria-hidden="true" /><input ref={ref} type="search" className={clsx('cm-input', className)} {...props} /></span>); SearchInput.displayName = 'SearchInput';
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => <select ref={ref} className={clsx('cm-select', className)} {...props} />); Select.displayName = 'Select';
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea ref={ref} className={clsx('cm-input cm-textarea', className)} {...props} />); Textarea.displayName = 'Textarea';
export const DateInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => <Input ref={ref} type="date" {...props} />); DateInput.displayName = 'DateInput';
export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string }>(({ label, className, ...props }, ref) => <label className={clsx('cm-choice', className)}><input ref={ref} type="checkbox" {...props} /><span>{label}</span></label>); Checkbox.displayName = 'Checkbox';
export const Radio = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string }>(({ label, className, ...props }, ref) => <label className={clsx('cm-choice', className)}><input ref={ref} type="radio" {...props} /><span>{label}</span></label>); Radio.displayName = 'Radio';

export const Tabs: React.FC<{ value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string; count?: number; disabled?: boolean }> }> = ({ value, onChange, items }) => <div className="cm-tabs" role="tablist">{items.map(item => <button key={item.value} type="button" role="tab" aria-selected={item.value === value} disabled={item.disabled} onClick={() => onChange(item.value)} className="cm-tab">{item.label}{item.count !== undefined && <Badge>{item.count}</Badge>}</button>)}</div>;

export const Tooltip: React.FC<{ content: string; children: React.ReactElement }> = ({ content, children }) => <span className="cm-tooltip" data-tooltip={content}>{children}</span>;

interface ModalProps { open: boolean; title: string; description?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; tone?: 'default' | 'confirm' | 'form' | 'danger' | 'information'; }
export const Modal: React.FC<ModalProps> = ({ open, title, description, onClose, children, footer, size = 'md', tone = 'default' }) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { if (!open) return; const previous = document.body.style.overflow, previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null; const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); if (event.key !== 'Tab' || !dialogRef.current) return; const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]; if (!items.length) { event.preventDefault(); dialogRef.current.focus(); return; } const first = items[0], last = items.at(-1)!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; document.body.style.overflow = 'hidden'; document.addEventListener('keydown', handleKey); requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')?.focus() || dialogRef.current?.focus()); return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', handleKey); previouslyFocused?.focus(); }; }, [open, onClose]);
  if (!open) return null;
  return createPortal(<div className="cm-modal-overlay"><button aria-label="Cerrar modal" className="cm-modal-backdrop" onClick={onClose} /><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={clsx('cm-modal', `cm-modal--${size}`, `cm-modal--${tone}`)}><header className="cm-modal__header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Cerrar" onClick={onClose}><X /></IconButton></header><div className="cm-modal__body">{children}</div>{footer && <footer className="cm-modal__footer">{footer}</footer>}</section></div>, document.body);
};

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; label?: string }> = ({ size = 'md', label = 'Cargando' }) => <span className={clsx('cm-spinner', `cm-spinner--${size}`)} role="status"><i /><span className="sr-only">{label}</span></span>;
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => <span aria-hidden="true" className={clsx('cm-skeleton', className)} />;
export const CardSkeleton = () => <Card className="cm-card-skeleton"><Skeleton className="h-3 w-2/5" /><Skeleton className="h-8 w-3/5" /><Skeleton className="h-3 w-4/5" /></Card>;
export const ChartSkeleton = () => <Card className="cm-chart-skeleton"><Skeleton className="h-3 w-2/5" /><Skeleton className="h-44 w-full" /><div><Skeleton className="h-2 w-16" /><Skeleton className="h-2 w-16" /></div></Card>;
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => <div className="cm-table-skeleton">{Array.from({ length: rows }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>;
export const PageSkeleton = () => <div className="cm-page-skeleton"><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-96 max-w-full" /><div className="grid gap-3 md:grid-cols-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div><TableSkeleton /></div>;

type StateKind = 'empty' | 'error';
const StatePanel: React.FC<{ kind: StateKind; title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({ kind, title, description, action, icon }) => <div className={clsx('cm-state', `cm-state--${kind}`)}>{icon || (kind === 'error' ? <AlertTriangle /> : <Info />)}<h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
export const EmptyState: React.FC<{ title?: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({ title = 'Sin resultados', description, action, icon }) => <StatePanel kind="empty" title={title} description={description} action={action} icon={icon} />;
export const ErrorState: React.FC<{ title?: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({ title = 'No fue posible cargar la información', description, action, icon }) => <StatePanel kind="error" title={title} description={description} action={action} icon={icon} />;

export const statusIcon = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info };
