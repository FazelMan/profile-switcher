import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  /** Prevent closing (e.g. while a request is in flight). */
  busy?: boolean;
  describedBy?: string;
}

/**
 * Modal built on the native <dialog> element: `showModal()` provides focus
 * containment, an inert background, and Escape-to-close natively.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  busy = false,
  describedBy,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { ui } = useI18n();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {open && (
        <div className="modal-content">
          <header className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              disabled={busy}
              aria-label={ui.common.close}
            >
              <X className="icon" aria-hidden="true" />
            </button>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
