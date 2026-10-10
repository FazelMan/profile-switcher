import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import type { ProfileView } from '@shared/ipc';
import { Button } from '../components/Button';
import { DeleteProfileDialog } from '../components/DeleteProfileDialog';
import { FirstRun } from '../components/FirstRun';
import { ProfileCard } from '../components/ProfileCard';
import { ProfileDetailsDialog } from '../components/ProfileDetailsDialog';
import { ProfileFormDialog, type ProfileFormMode } from '../components/ProfileFormDialog';
import { useI18n } from '../i18n';
import { useController } from '../state';

type DialogState =
  | { kind: 'form'; mode: ProfileFormMode }
  | { kind: 'details'; profileId: string }
  | { kind: 'delete'; profileId: string }
  | null;

export function ProfilesView() {
  const { api, call, snapshot, applySnapshot } = useController();
  const { ui } = useI18n();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [filter, setFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  if (!snapshot) return null;
  const { profiles, apps, readOnly } = snapshot;
  const appIdsInUse = [...new Set(profiles.map((p) => p.appId))];
  const visible = filter === 'all' ? profiles : profiles.filter((p) => p.appId === filter);
  const findProfile = (id: string): ProfileView | undefined => profiles.find((p) => p.id === id);
  const close = () => setDialog(null);

  const refresh = async () => {
    setRefreshing(true);
    const result = await call(() => api.refreshApps());
    setRefreshing(false);
    if (result.ok) applySnapshot(result.value);
  };

  const detailsProfile = dialog?.kind === 'details' ? findProfile(dialog.profileId) : undefined;
  const deleteProfile = dialog?.kind === 'delete' ? findProfile(dialog.profileId) : undefined;

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>{ui.dashboard.title}</h1>
          <p className="muted">{ui.dashboard.subtitle}</p>
        </div>
        <div className="button-row">
          <Button
            icon={<RefreshCw className="icon" aria-hidden="true" />}
            loading={refreshing}
            onClick={() => void refresh()}
          >
            {ui.dashboard.refreshDetection}
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="icon" aria-hidden="true" />}
            disabled={readOnly}
            onClick={() => setDialog({ kind: 'form', mode: { kind: 'create' } })}
          >
            {ui.dashboard.newProfile}
          </Button>
        </div>
      </header>

      {profiles.length === 0 ? (
        <FirstRun
          onCustom={(appId) => setDialog({ kind: 'form', mode: { kind: 'create', appId } })}
        />
      ) : (
        <>
          {appIdsInUse.length > 1 && (
            <div className="filters" role="group" aria-label={ui.dashboard.filterLabel}>
              {['all', ...appIdsInUse].map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`chip${filter === id ? ' active' : ''}`}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {id === 'all'
                    ? ui.dashboard.filterAll
                    : (apps.find((a) => a.id === id)?.displayName ?? id)}
                </button>
              ))}
            </div>
          )}
          {visible.length === 0 ? (
            <p className="muted">{ui.dashboard.empty}</p>
          ) : (
            <div className="profile-grid">
              {visible.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  app={apps.find((a) => a.id === profile.appId)}
                  isLastLaunched={snapshot.lastLaunchedProfileId === profile.id}
                  readOnly={readOnly}
                  onDetails={() => setDialog({ kind: 'details', profileId: profile.id })}
                  onEdit={() => setDialog({ kind: 'form', mode: { kind: 'edit', profile } })}
                  onDelete={() => setDialog({ kind: 'delete', profileId: profile.id })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {dialog?.kind === 'form' && <ProfileFormDialog mode={dialog.mode} onClose={close} />}
      {detailsProfile && <ProfileDetailsDialog profile={detailsProfile} onClose={close} />}
      {deleteProfile && <DeleteProfileDialog profile={deleteProfile} onClose={close} />}
    </div>
  );
}
