import { ClipboardCopy, Info, Pencil, Play, Trash2 } from 'lucide-react';
import type { AppSummary } from '@shared/domain/compatibility';
import type { ProfileView } from '@shared/ipc';
import { useProfileActions } from '../hooks/useProfileActions';
import { useI18n } from '../i18n';
import { useController } from '../state';
import { AppGlyph } from './AppGlyph';
import { RuntimeIndicator } from './RuntimeStatus';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';

export interface ProfileCardProps {
  profile: ProfileView;
  app: AppSummary | undefined;
  isLastLaunched: boolean;
  readOnly: boolean;
  onDetails(): void;
  onEdit(): void;
  onDelete(): void;
}

export function ProfileCard({
  profile,
  app,
  isLastLaunched,
  readOnly,
  onDetails,
  onEdit,
  onDelete,
}: ProfileCardProps) {
  const { ui, format, relativeTime } = useI18n();
  const { snapshot, runtime } = useController();
  const instances = runtime[profile.id] ?? [];
  const { busy, primary } = useProfileActions(profile, app);
  const { compatibility } = profile;
  const copyMode =
    app?.kind === 'cli' &&
    app.supportsCopyCommand &&
    snapshot?.settings.cliLaunchBehavior === 'copy-command';
  const headingId = `profile-${profile.id}-name`;

  let lastLaunchText: string = ui.dashboard.neverLaunched;
  if (profile.lastLaunch) {
    const time = relativeTime(profile.lastLaunch.at);
    lastLaunchText = format(
      profile.lastLaunch.outcome === 'started'
        ? ui.dashboard.lastLaunched
        : ui.dashboard.lastLaunchFailed,
      { time },
    );
  }

  const primaryLabel = copyMode
    ? ui.dashboard.copyCommand
    : compatibility.launch.isolation === 'shared'
      ? ui.dashboard.launchShared
      : ui.dashboard.launch;

  return (
    <article
      className="card profile-card"
      data-color={profile.color}
      aria-labelledby={headingId}
      data-testid="profile-card"
    >
      <div className="card-accent" aria-hidden="true" />
      <header className="profile-card-header">
        <span className="avatar" aria-hidden="true">
          {Array.from(profile.name)[0]?.toUpperCase()}
        </span>
        <div className="profile-card-title">
          <h3 id={headingId}>{profile.name}</h3>
          <p className="muted app-line">
            <AppGlyph kind={app?.kind} />
            {app?.displayName ?? profile.appId}
          </p>
        </div>
        {isLastLaunched && <span className="pill">{ui.dashboard.lastUsedBadge}</span>}
      </header>

      <div className="profile-card-status">
        <StatusBadge report={compatibility} />
      </div>
      <RuntimeIndicator instances={instances} />
      {profile.description && <p className="profile-description">{profile.description}</p>}
      <p className={`muted small${profile.lastLaunch?.outcome === 'failed' ? ' text-danger' : ''}`}>
        {lastLaunchText}
      </p>

      <footer className="profile-card-actions">
        <Button
          variant="primary"
          icon={
            copyMode ? (
              <ClipboardCopy className="icon" aria-hidden="true" />
            ) : (
              <Play className="icon" aria-hidden="true" />
            )
          }
          loading={busy !== null}
          disabled={!compatibility.launch.available}
          onClick={() => void primary()}
          aria-describedby={headingId}
        >
          {busy === 'launch' ? ui.dashboard.launching : primaryLabel}
        </Button>
        <div className="card-secondary-actions">
          <button
            type="button"
            className="icon-button"
            onClick={onDetails}
            aria-label={`${ui.common.details}: ${profile.name}`}
            title={ui.common.details}
          >
            <Info className="icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onEdit}
            disabled={readOnly}
            aria-label={`${ui.common.edit}: ${profile.name}`}
            title={ui.common.edit}
          >
            <Pencil className="icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button danger"
            onClick={onDelete}
            disabled={readOnly}
            aria-label={`${ui.common.delete}: ${profile.name}`}
            title={ui.common.delete}
          >
            <Trash2 className="icon" aria-hidden="true" />
          </button>
        </div>
      </footer>
    </article>
  );
}
