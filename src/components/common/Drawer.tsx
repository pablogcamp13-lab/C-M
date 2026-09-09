import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Canonical C&M side panel. All present and future right-side dialogs should
 * use this primitive so portal rendering cannot escape the design system.
 */
export const Drawer: React.FC<DrawerProps> = ({
  title,
  subtitle,
  eyebrow,
  icon,
  size = 'lg',
  onClose,
  children,
  footer
}) => {
  const titleId = useId();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="cm-drawer-overlay" data-cm-overlay="drawer">
      <button className="cm-drawer-backdrop" onClick={onClose} aria-label="Cerrar panel" />
      <section className={`cm-drawer cm-drawer--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="cm-drawer__header">
          <div className="cm-drawer__heading">
            {icon && <span className="cm-drawer__icon">{icon}</span>}
            <div className="min-w-0">
              {eyebrow && <p className="cm-drawer__eyebrow">{eyebrow}</p>}
              <h2 id={titleId} className="cm-drawer__title">{title}</h2>
              {subtitle && <p className="cm-drawer__subtitle">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="cm-drawer__close" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="cm-drawer__body">{children}</div>
        {footer && <footer className="cm-drawer__footer">{footer}</footer>}
      </section>
    </div>,
    document.body
  );
};
