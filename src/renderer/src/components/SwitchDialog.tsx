import { useId } from 'react';
import { Power, TriangleAlert } from 'lucide-react';
import type { AppSummary } from '@shared/domain/compatibility';
import type { ProfileView } from '@shared/ipc';
import type { PendingSwitch } from '../hooks/useProfileActions';
import { useI18n } from '../i18n';
import { useController } from '../state';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * Switch-mode confirmation. Lists exactly the instances that would be asked
 * to quit; nothing is closed unless the user picks "Close and open".
 */
export function SwitchDialog({
  profile,
  app,
  pending,
  busy,
  onResolve,
  onCancel,
}: {
  profile: ProfileView;
  app: AppSummary | undefined;
  pending: PendingSwitch;
  busy: 'launch' | 'desktop' | 'switch' | null;
  onResolve(choice: 'close' | 'keep'): void;
  onCancel(): void;
}) {
  const { snapshot } = useController();
  const { ui, format, list } = useI18n();
  const bodyId = useId();
  const nameOf = (id: string) => snapshot?.profiles.find((p) => p.id === id)?.name ?? id;
  const untracked = pending.untrackedProfileIds.map(nameOf);

  return (
    <Modal
      open
      title={format(ui.switchDialog.title, { name: profile.name })}
      onClose={onCancel}
      busy={busy !== null}
      describedBy={bodyId}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy !== null} autoFocus>
            {ui.common.cancel}
          </Button>
          <Button
            loading={busy === 'launch'}
            disabled={busy !== null}
            onClick={() => onResolve('keep')}
          >
            {ui.switchDialog.alongside}
          </Button>
          <Button
            variant="danger"
            icon={<Power className="icon" aria-hidden="true" />}
            loading={busy === 'switch'}
            disabled={busy !== null}
            onClick={() => onResolve('close')}
          >
            {busy === 'switch'
              ? ui.switchDialog.closing
              : format(ui.switchDialog.close, { name: profile.name })}
          </Button>
        </>
      }
    >
      <div id={bodyId} className="switch-dialog">
        <p>
          {format(ui.switchDialog.body, {
            app: app?.displayName ?? profile.appId,
            name: profile.name,
          })}
        </p>
        <ul className="switch-list" data-testid="switch-list">
          {pending.running.map((instance) => (
            <li key={instance.launchId}>
              {format(ui.switchDialog.instance, {
                profile: nameOf(instance.profileId),
                pid: instance.pid,
              })}
            </li>
          ))}
        </ul>
        <div className="callout tone-warn">
          <TriangleAlert className="icon" aria-hidden="true" />
          <p>{ui.switchDialog.warning}</p>
        </div>
        {untracked.length > 0 && (
          <p className="small muted">
            {format(ui.switchDialog.untracked, {
              names: list(untracked),
            })}
          </p>
        )}
      </div>
    </Modal>
  );
}
