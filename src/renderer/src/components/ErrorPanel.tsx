import { TriangleAlert } from 'lucide-react';
import type { AppError } from '@shared/domain/errors';
import { useI18n } from '../i18n';

/** Inline error: what failed, the likely reason, and what to do next. */
export function ErrorPanel({ error, compact = false }: { error: AppError; compact?: boolean }) {
  const i18n = useI18n();
  const text = i18n.error(error);
  return (
    <div className={`error-panel${compact ? ' compact' : ''}`} role="alert">
      <TriangleAlert className="icon" aria-hidden="true" />
      <div>
        <p className="error-title">{text.title}</p>
        <p>{text.reason}</p>
        <p className="error-next">{text.next}</p>
      </div>
    </div>
  );
}
