import { Info, Pencil, Trash2 } from 'lucide-react';
import type { AppSummary } from '@shared/domain/compatibility';
import type { ProfileView } from '@shared/ipc';
import { useProfileActions } from '../hooks/useProfileActions';
import { useI18n } from '../i18n';
import { useController } from '../state';
import { AppGlyph } from './AppGlyph';
import { RuntimeIndicator } from './RuntimeStatus';
import { StatusBadge } from './StatusBadge';
import { LaunchControls, LaunchDialogs } from './LaunchControls';

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
  const { runtime } = useController();
  const instances = runtime[profile.id] ?? [];
  const actions = useProfileActions(profile, app);
  const { compatibility } = profile;
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

  return (
    <>
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
          {compatibility.launch.isolation === 'experimental' && (
            <span className="pill pill-warn">{ui.dashboard.experimentalBadge}</span>
          )}
          {isLastLaunched && <span className="pill">{ui.dashboard.lastUsedBadge}</span>}
        </header>

        <div className="profile-card-status">
          <StatusBadge report={compatibility} />
        </div>
        <RuntimeIndicator instances={instances} />
        {profile.description && <p className="profile-description">{profile.description}</p>}
        <p
          className={`muted small${profile.lastLaunch?.outcome === 'failed' ? ' text-danger' : ''}`}
        >
          {lastLaunchText}
        </p>

        <footer className="profile-card-actions">
          <LaunchControls profile={profile} app={app} actions={actions} describedBy={headingId} />
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
      <LaunchDialogs profile={profile} app={app} actions={actions} />
    </>
  );
}
