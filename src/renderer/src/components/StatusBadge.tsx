import { CircleHelp, ShieldAlert, ShieldCheck, ShieldOff, TriangleAlert } from 'lucide-react';
import type { CompatibilityReport, CompatibilityState } from '@shared/domain/compatibility';
import { useI18n } from '../i18n';

const ICONS: Record<CompatibilityState, typeof ShieldCheck> = {
  Supported: ShieldCheck,
  NeedsVerification: ShieldAlert,
  Unsupported: ShieldOff,
  ApplicationNotFound: CircleHelp,
  ConfigurationError: TriangleAlert,
};

const TONES: Record<CompatibilityState, string> = {
  Supported: 'ok',
  NeedsVerification: 'warn',
  Unsupported: 'muted',
  ApplicationNotFound: 'muted',
  ConfigurationError: 'danger',
};

export function StatusBadge({ report }: { report: CompatibilityReport }) {
  const { ui } = useI18n();
  const Icon = ICONS[report.state];
  // "Supported" with shared isolation (app-default storage) must not look
  // like an isolation guarantee.
  const shared = report.state === 'Supported' && report.launch.isolation === 'shared';
  const tone = shared ? 'muted' : TONES[report.state];
  const label =
    report.state === 'Supported' ? ui.isolation[report.launch.isolation] : ui.states[report.state];
  return (
    <span className={`badge badge-${tone}`} data-state={report.state}>
      <Icon className="icon" aria-hidden="true" />
      {label}
    </span>
  );
}
