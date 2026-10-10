import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { useController } from '../state';

export function Toasts() {
  const { toasts, dismissToast } = useController();
  const i18n = useI18n();
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const errorText = toast.error ? i18n.error(toast.error) : null;
        const Icon =
          toast.kind === 'success' ? CircleCheck : toast.kind === 'error' ? CircleX : Info;
        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <Icon className="icon" aria-hidden="true" />
            <div className="toast-text">
              <p className="toast-title">{errorText ? errorText.title : toast.title}</p>
              {errorText ? (
                <>
                  <p>{errorText.reason}</p>
                  <p>{errorText.next}</p>
                </>
              ) : (
                toast.body && <p>{toast.body}</p>
              )}
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => dismissToast(toast.id)}
              aria-label={i18n.ui.common.dismiss}
            >
              <X className="icon" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
