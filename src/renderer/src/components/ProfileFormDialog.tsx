import { useId, useMemo, useState, type FormEvent } from 'react';
import { FolderOpen, TriangleAlert } from 'lucide-react';
import type { AppError } from '@shared/domain/errors';
import {
  DESCRIPTION_MAX_LENGTH,
  descriptionSchema,
  NAME_MAX_LENGTH,
  nameKey,
  PROFILE_COLORS,
  profileNameSchema,
  type ProfileColor,
  type StorageKind,
} from '@shared/domain/profile';
import type { DirectoryChoice, ProfileView } from '@shared/ipc';
import { useI18n } from '../i18n';
import { useController } from '../state';
import { AppGlyph } from './AppGlyph';
import { Button } from './Button';
import { ErrorPanel } from './ErrorPanel';
import { Modal } from './Modal';

export type ProfileFormMode =
  { kind: 'create'; appId?: string } | { kind: 'edit'; profile: ProfileView };

interface FieldErrors {
  name?: string;
  description?: string;
  customPath?: string;
}

export function ProfileFormDialog({ mode, onClose }: { mode: ProfileFormMode; onClose(): void }) {
  const { api, call, snapshot, applySnapshot, notify } = useController();
  const { ui, format, message } = useI18n();
  const formId = useId();
  const editing = mode.kind === 'edit' ? mode.profile : null;
  const apps = useMemo(() => snapshot?.apps ?? [], [snapshot]);
  const profiles = useMemo(() => snapshot?.profiles ?? [], [snapshot]);

  const initialApp =
    editing?.appId ??
    (mode.kind === 'create' ? mode.appId : undefined) ??
    apps.find((a) => a.platformSupported && a.isolationDocumented)?.id ??
    apps.find((a) => a.platformSupported)?.id ??
    '';
  const usedColors = new Set(profiles.map((p) => p.color));

  const [name, setName] = useState(editing?.name ?? '');
  const [appId, setAppId] = useState(initialApp);
  const [color, setColor] = useState<ProfileColor>(
    editing?.color ?? PROFILE_COLORS.find((c) => !usedColors.has(c)) ?? 'blue',
  );
  const [description, setDescription] = useState(editing?.description ?? '');
  const app = apps.find((a) => a.id === appId);
  const [storageKind, setStorageKind] = useState<StorageKind>(
    editing?.storage.kind ?? app?.defaultStorageKind ?? 'managed',
  );
  const [customPath, setCustomPath] = useState<DirectoryChoice | null>(null);
  const [allowNonEmpty, setAllowNonEmpty] = useState(false);
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(
    editing?.launch.workingDirectory ?? null,
  );
  const [inheritCredentialEnv, setInheritCredentialEnv] = useState(
    editing?.launch.inheritCredentialEnv ?? false,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);

  const selectApp = (id: string) => {
    setAppId(id);
    const next = apps.find((a) => a.id === id);
    if (next && !next.storageKinds.includes(storageKind)) setStorageKind(next.defaultStorageKind);
    setServerError(null);
  };

  const chooseFolder = async (purpose: 'profile-data' | 'working-directory') => {
    const result = await call(() => api.chooseDirectory(purpose));
    if (!result.ok || !result.value) return;
    if (purpose === 'profile-data') {
      setCustomPath(result.value);
      setAllowNonEmpty(false);
      setErrors((e) => ({ ...e, customPath: undefined }));
      setServerError(null);
    } else {
      setWorkingDirectory(result.value.path);
    }
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const parsedName = profileNameSchema.safeParse(name);
    if (!parsedName.success) {
      const code = parsedName.error.issues[0]?.message;
      next.name =
        code === 'name.tooLong'
          ? format(ui.form.errors.nameTooLong, { max: NAME_MAX_LENGTH })
          : code === 'name.invalidCharacters'
            ? ui.form.errors.nameInvalid
            : ui.form.errors.nameRequired;
    } else if (
      profiles.some(
        (p) =>
          p.appId === appId && p.id !== editing?.id && nameKey(p.name) === nameKey(parsedName.data),
      )
    ) {
      next.name = format(ui.form.errors.nameDuplicate, { app: app?.displayName ?? appId });
    }
    const parsedDescription = descriptionSchema.safeParse(description);
    if (!parsedDescription.success) {
      next.description =
        parsedDescription.error.issues[0]?.message === 'description.tooLong'
          ? format(ui.form.errors.descriptionTooLong, { max: DESCRIPTION_MAX_LENGTH })
          : ui.form.errors.descriptionInvalid;
    }
    if (!editing && storageKind === 'custom' && !customPath)
      next.customPath = ui.form.errors.folderRequired;
    return next;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const fieldErrors = validate();
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(Boolean)) return;
    setSaving(true);
    setServerError(null);
    const launch = app?.supportsWorkingDirectory
      ? { workingDirectory, inheritCredentialEnv }
      : { inheritCredentialEnv };

    if (editing) {
      const result = await call(
        () => api.updateProfile({ id: editing.id, name, description, color, launch }),
        { quiet: true },
      );
      setSaving(false);
      if (!result.ok) return setServerError(result.error);
      applySnapshot(result.value);
      notify({ kind: 'success', title: format(ui.form.saved, { name: name.trim() }) });
      return onClose();
    }

    const storage =
      storageKind === 'custom' && customPath
        ? { kind: 'custom' as const, path: customPath.path, allowNonEmpty }
        : storageKind === 'app-default'
          ? { kind: 'app-default' as const }
          : { kind: 'managed' as const };
    const result = await call(
      () => api.createProfile({ name, appId, color, description, storage, launch }),
      {
        quiet: true,
      },
    );
    setSaving(false);
    if (!result.ok) return setServerError(result.error);
    applySnapshot(result.value.snapshot);
    notify({ kind: 'success', title: format(ui.form.created, { name: name.trim() }) });
    onClose();
  };

  const needsNonEmptyConfirm =
    storageKind === 'custom' &&
    customPath !== null &&
    ((customPath.exists && !customPath.isEmpty) || serverError?.code === 'DIRECTORY_NOT_EMPTY');

  return (
    <Modal
      open
      size="lg"
      title={editing ? ui.form.editTitle : ui.form.createTitle}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {ui.common.cancel}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={saving}>
            {saving
              ? editing
                ? ui.common.saving
                : ui.common.creating
              : editing
                ? ui.common.save
                : ui.common.create}
          </Button>
        </>
      }
    >
      <form id={formId} className="form" onSubmit={(event) => void submit(event)} noValidate>
        {serverError && <ErrorPanel error={serverError} compact />}

        <div className="field">
          <label htmlFor={`${formId}-name`}>{ui.form.name}</label>
          <input
            id={`${formId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={ui.form.namePlaceholder}
            maxLength={NAME_MAX_LENGTH + 10}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${formId}-name-error` : undefined}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {errors.name && (
            <p id={`${formId}-name-error`} className="field-error">
              {errors.name}
            </p>
          )}
        </div>

        <fieldset className="field">
          <legend>{ui.form.application}</legend>
          {editing && <p className="field-help">{ui.form.applicationLocked}</p>}
          <div className="choice-grid">
            {apps.map((candidate) => {
              const detected = candidate.detection.status === 'found';
              const disabled = !!editing || !candidate.platformSupported;
              return (
                <label
                  key={candidate.id}
                  className={`choice-card${appId === candidate.id ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name={`${formId}-app`}
                    value={candidate.id}
                    checked={appId === candidate.id}
                    disabled={disabled}
                    onChange={() => selectApp(candidate.id)}
                  />
                  <span className="choice-title">
                    <AppGlyph kind={candidate.kind} />
                    {candidate.displayName}
                  </span>
                  <span className="choice-meta">
                    {candidate.isolationDocumented
                      ? format(ui.form.isolationDocumented, {
                          mechanism: message(candidate.mechanism),
                        })
                      : candidate.experimental?.enabled
                        ? format(ui.form.isolationDocumented, {
                            mechanism: message(candidate.experimental.mechanism),
                          })
                        : ui.form.isolationNotDocumented}
                  </span>
                  <span className="choice-meta">
                    {!candidate.platformSupported
                      ? ui.form.unsupportedPlatform
                      : detected
                        ? format(ui.form.detected, {
                            version: candidate.detection.version
                              ? ` · ${candidate.detection.version}`
                              : '',
                          })
                        : ui.form.notDetected}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>{ui.form.color}</legend>
          <div className="swatches" role="radiogroup" aria-label={ui.form.color}>
            {PROFILE_COLORS.map((candidate) => (
              <label
                key={candidate}
                className="swatch"
                data-color={candidate}
                title={ui.colors[candidate]}
              >
                <input
                  type="radio"
                  name={`${formId}-color`}
                  value={candidate}
                  checked={color === candidate}
                  onChange={() => setColor(candidate)}
                  aria-label={ui.colors[candidate]}
                />
                <span aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor={`${formId}-description`}>{ui.form.description}</label>
          <textarea
            id={`${formId}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={ui.form.descriptionPlaceholder}
            rows={2}
            aria-invalid={errors.description ? true : undefined}
          />
          {errors.description && <p className="field-error">{errors.description}</p>}
        </div>

        <fieldset className="field">
          <legend>{ui.form.storage}</legend>
          {editing ? (
            <>
              <p className="field-value">{ui.storageKinds[editing.storage.kind]}</p>
              {editing.dataDirectory && <p className="path">{editing.dataDirectory}</p>}
              <p className="field-help">{ui.form.storageLocked}</p>
            </>
          ) : (
            <div className="radio-list">
              {(app?.storageKinds ?? []).map((kind) => (
                <label key={kind} className="radio-row">
                  <input
                    type="radio"
                    name={`${formId}-storage`}
                    value={kind}
                    checked={storageKind === kind}
                    onChange={() => {
                      setStorageKind(kind);
                      setServerError(null);
                    }}
                  />
                  <span>
                    <span className="radio-title">{ui.storageKinds[kind]}</span>
                    <span className="field-help">{ui.storageHelp[kind]}</span>
                  </span>
                </label>
              ))}
              {app?.experimental?.enabled &&
                app.experimental.storageKinds.includes(storageKind) && (
                  <div className="callout tone-warn" data-testid="experimental-storage-warning">
                    <TriangleAlert className="icon" aria-hidden="true" />
                    <p>{ui.form.experimentalStorage}</p>
                  </div>
                )}
              {storageKind === 'custom' && (
                <div className="nested">
                  <div className="path-picker">
                    <span className={`path${customPath ? '' : ' muted'}`}>
                      {customPath?.path ?? ui.form.noFolderChosen}
                    </span>
                    <Button
                      size="sm"
                      icon={<FolderOpen className="icon" aria-hidden="true" />}
                      aria-label={ui.form.chooseProfileFolder}
                      onClick={() => void chooseFolder('profile-data')}
                    >
                      {ui.common.choose}
                    </Button>
                  </div>
                  {errors.customPath && <p className="field-error">{errors.customPath}</p>}
                  {needsNonEmptyConfirm && (
                    <label className="checkbox-row warning">
                      <input
                        type="checkbox"
                        checked={allowNonEmpty}
                        onChange={(event) => setAllowNonEmpty(event.target.checked)}
                      />
                      <span>
                        <span className="radio-title">{ui.form.allowNonEmpty}</span>
                        <span className="field-help">{ui.form.allowNonEmptyHelp}</span>
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
        </fieldset>

        {app?.supportsWorkingDirectory && (
          <div className="field">
            <span className="label" id={`${formId}-wd`}>
              {ui.form.workingDirectory}
            </span>
            <div className="path-picker" aria-labelledby={`${formId}-wd`}>
              <span className={`path${workingDirectory ? '' : ' muted'}`}>
                {workingDirectory ?? ui.common.notSet}
              </span>
              <Button
                size="sm"
                icon={<FolderOpen className="icon" aria-hidden="true" />}
                aria-label={ui.form.chooseWorkingDirectory}
                onClick={() => void chooseFolder('working-directory')}
              >
                {ui.common.choose}
              </Button>
              {workingDirectory && (
                <Button size="sm" variant="ghost" onClick={() => setWorkingDirectory(null)}>
                  {ui.common.clear}
                </Button>
              )}
            </div>
            <p className="field-help">{ui.form.workingDirectoryHelp}</p>
          </div>
        )}

        {app?.kind === 'cli' && (
          <details className="advanced">
            <summary>{ui.form.advanced}</summary>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={inheritCredentialEnv}
                onChange={(event) => setInheritCredentialEnv(event.target.checked)}
              />
              <span>
                <span className="radio-title">{ui.form.inheritCredentialEnv}</span>
                <span className="field-help">{ui.form.inheritCredentialEnvHelp}</span>
              </span>
            </label>
          </details>
        )}
      </form>
    </Modal>
  );
}
