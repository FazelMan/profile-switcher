import { useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ProfileView } from '@shared/ipc';
import { useI18n } from '../i18n';
import { useController } from '../state';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * Deleting a profile removes metadata only. The dialog states plainly that
 * the configuration folder (and any sign-in stored there) stays on disk.
 */
export function DeleteProfileDialog({
  profile,
  onClose,
}: {
  profile: ProfileView;
  onClose(): void;
}) {
  const { api, call, applySnapshot, notify } = useController();
  const { ui, format } = useI18n();
  const [deleting, setDeleting] = useState(false);
  const bodyId = useId();

  const confirm = async () => {
    setDeleting(true);
    const result = await call(() => api.deleteProfile(profile.id));
    setDeleting(false);
    if (!result.ok) return;
    applySnapshot(result.value.snapshot);
    notify({
      kind: 'success',
      title: format(
        result.value.retainedDirectory ? ui.delete.deleted : ui.delete.deletedNoFolder,
        { name: profile.name },
      ),
      body: result.value.retainedDirectory ?? undefined,
    });
    onClose();
  };

  return (
    <Modal
      open
      title={format(ui.delete.title, { name: profile.name })}
      onClose={onClose}
      busy={deleting}
      describedBy={bodyId}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting} autoFocus>
            {ui.common.cancel}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="icon" aria-hidden="true" />}
            loading={deleting}
            onClick={() => void confirm()}
          >
            {ui.delete.confirm}
          </Button>
        </>
      }
    >
      <div id={bodyId}>
        <p>{ui.delete.body}</p>
        {profile.dataDirectory ? (
          <>
            <p>{ui.delete.keepsData}</p>
            <p className="path">{profile.dataDirectory}</p>
          </>
        ) : (
          <p>{ui.delete.noData}</p>
        )}
      </div>
    </Modal>
  );
}
