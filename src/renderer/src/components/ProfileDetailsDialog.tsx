import { useState } from 'react';
import { BadgeCheck, ClipboardCopy, FolderOpen, Play, ShieldAlert, Undo2 } from 'lucide-react';
import type { CommandShell } from '@shared/domain/compatibility';
import type { AppError } from '@shared/domain/errors';
import type { Message } from '@shared/domain/messages';
import type { ProfileView, VerificationReport } from '@shared/ipc';
import { useProfileActions } from '../hooks/useProfileActions';
import { useI18n } from '../i18n';
import { useController } from '../state';
import { Button } from './Button';
import { ErrorPanel } from './ErrorPanel';
import { Modal } from './Modal';
import { InstanceList } from './RuntimeStatus';
import { StatusBadge } from './StatusBadge';
import { SwitchDialog } from './SwitchDialog';

function MessageList({
  title,
  items,
  tone,
}: {
  title: string;
  items: Message[];
  tone: 'ok' | 'warn' | 'info';
}) {
  const { message } = useI18n();
  if (items.length === 0) return null;
  return (
    <section className={`message-list tone-${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.code}>{message(item)}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * For experimental profiles: the user's own record that they checked the
 * profile keeps its own sign-in. Shown as the user's observation, never as a
 * verification by Profile Switcher.
 */
function ManualCheck({ profile, version }: { profile: ProfileView; version: string | null }) {
  const { api, call, applySnapshot, notify, snapshot } = useController();
  const { ui, format, relativeTime } = useI18n();
  const [saving, setSaving] = useState(false);
  const check = profile.manualCheck;
  const text = ui.details.manualCheck;

  const update = async (checked: boolean) => {
    setSaving(true);
    const result = await call(() => api.setManualCheck(profile.id, checked));
    setSaving(false);
    if (!result.ok) return;
    applySnapshot(result.value);
    notify({ kind: 'success', title: checked ? text.saved : text.cleared });
  };

  return (
    <section className="manual-check" aria-labelledby={`manual-check-${profile.id}`}>
      <h3 id={`manual-check-${profile.id}`}>{text.title}</h3>
      <p className="field-help">{text.help}</p>
      <p>
        {check
          ? format(text.checked, {
              time: relativeTime(check.at),
              version: check.appVersion ?? text.unknownVersion,
            })
          : text.none}
      </p>
      <div className="button-row">
        <Button
          icon={<BadgeCheck className="icon" aria-hidden="true" />}
          loading={saving}
          disabled={snapshot?.readOnly || (check !== null && check.appVersion === version)}
          onClick={() => void update(true)}
        >
          {text.mark}
        </Button>
        {check && (
          <Button
            variant="ghost"
            icon={<Undo2 className="icon" aria-hidden="true" />}
            disabled={saving || snapshot?.readOnly}
            onClick={() => void update(false)}
          >
            {text.clear}
          </Button>
        )}
      </div>
    </section>
  );
}

function VerificationResult({ report }: { report: VerificationReport }) {
  const { ui, format, dateTime } = useI18n();
  const signIn =
    report.loggedIn === null
      ? ui.details.signInUnknown
      : report.loggedIn
        ? ui.details.signedIn
        : ui.details.signedOut;
  return (
    <section
      className={`verification ${report.configDirectoryMatches === false ? 'tone-warn' : report.configDirectoryMatches ? 'tone-ok' : 'tone-info'}`}
      aria-live="polite"
    >
      <h3>
        {report.configDirectoryMatches === false ? (
          <ShieldAlert className="icon" aria-hidden="true" />
        ) : (
          <BadgeCheck className="icon" aria-hidden="true" />
        )}
        {ui.details.verificationTitle}
      </h3>
      <p>
        {report.configDirectoryMatches === null
          ? ui.details.verifiedFolderNotReported
          : report.configDirectoryMatches
            ? ui.details.verifiedFolderMatch
            : format(ui.details.verifiedFolderMismatch, {
                folder: report.reportedConfigDirectory ?? ui.common.unknown,
              })}
      </p>
      <dl className="kv">
        <dt>{ui.details.signInLabel}</dt>
        <dd>{signIn}</dd>
        {report.authMethod && (
          <>
            <dt>{ui.details.authMethod}</dt>
            <dd>{report.authMethod}</dd>
          </>
        )}
        {report.account.email && (
          <>
            <dt>{ui.details.account}</dt>
            <dd>{report.account.email}</dd>
          </>
        )}
        {report.account.organization && (
          <>
            <dt>{ui.details.organization}</dt>
            <dd>{report.account.organization}</dd>
          </>
        )}
        {report.account.subscription && (
          <>
            <dt>{ui.details.plan}</dt>
            <dd>{report.account.subscription}</dd>
          </>
        )}
        {report.appVersion && (
          <>
            <dt>{ui.details.appVersion}</dt>
            <dd>{report.appVersion}</dd>
          </>
        )}
      </dl>
      {report.strippedVariables.length > 0 && (
        <p className="small muted">
          {format(ui.details.strippedVariables, { variables: report.strippedVariables.join(', ') })}
        </p>
      )}
      <p className="small muted">
        {dateTime(report.verifiedAt)} · {ui.details.notStored}
      </p>
    </section>
  );
}

export function ProfileDetailsDialog({
  profile,
  onClose,
}: {
  profile: ProfileView;
  onClose(): void;
}) {
  const { api, call, snapshot, runtime } = useController();
  const { ui, message, dateTime, relativeTime } = useI18n();
  const app = snapshot?.apps.find((a) => a.id === profile.appId);
  const { busy, launch, copyCommand, pendingSwitch, resolveSwitch, cancelSwitch } =
    useProfileActions(profile, app);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<VerificationReport | null>(null);
  const [verifyError, setVerifyError] = useState<AppError | null>(null);
  const shells = app?.copyCommandShells ?? [];
  const [shell, setShell] = useState<CommandShell | undefined>(shells[0]);
  const { compatibility } = profile;

  const verify = async () => {
    setVerifying(true);
    setVerifyError(null);
    const result = await call(() => api.verifyProfile(profile.id), { quiet: true });
    setVerifying(false);
    if (result.ok) setVerification(result.value);
    else setVerifyError(result.error);
  };

  const openFolder = () => void call(() => api.openProfileDirectory(profile.id));

  return (
    <Modal
      open
      size="lg"
      title={`${ui.details.title}: ${profile.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {ui.common.close}
          </Button>
          <Button
            variant="primary"
            icon={<Play className="icon" aria-hidden="true" />}
            disabled={!compatibility.launch.available}
            loading={busy === 'launch' || busy === 'switch'}
            onClick={() => void launch()}
          >
            {compatibility.launch.isolation === 'shared'
              ? ui.dashboard.launchShared
              : ui.dashboard.launch}
          </Button>
        </>
      }
    >
      {pendingSwitch && (
        <SwitchDialog
          profile={profile}
          app={app}
          pending={pendingSwitch}
          busy={busy === 'copy' ? null : busy}
          onResolve={(choice) => void resolveSwitch(choice)}
          onCancel={cancelSwitch}
        />
      )}
      <div className="details">
        <section className="details-status">
          <StatusBadge report={compatibility} />
          <p>{message(compatibility.summary)}</p>
        </section>

        <MessageList title={ui.details.guaranteed} items={compatibility.guarantees} tone="ok" />
        <MessageList
          title={ui.details.notGuaranteed}
          items={compatibility.limitations}
          tone="warn"
        />
        <MessageList title={ui.details.nextSteps} items={compatibility.guidance} tone="info" />

        {compatibility.launch.available && <InstanceList instances={runtime[profile.id] ?? []} />}

        <dl className="kv">
          <dt>{ui.details.mechanism}</dt>
          <dd>
            {compatibility.launch.isolation === 'experimental' && app?.experimental
              ? message(app.experimental.mechanism)
              : app
                ? message(app.mechanism)
                : ui.common.unknown}
          </dd>
          <dt>{ui.details.folder}</dt>
          <dd>
            {profile.dataDirectory ? (
              <span className="path">{profile.dataDirectory}</span>
            ) : (
              ui.details.folderAppDefault
            )}
          </dd>
          {app?.supportsWorkingDirectory && (
            <>
              <dt>{ui.details.workingDirectory}</dt>
              <dd>
                {profile.launch.workingDirectory ? (
                  <span className="path">{profile.launch.workingDirectory}</span>
                ) : (
                  ui.common.notSet
                )}
              </dd>
            </>
          )}
          <dt>{ui.details.lastLaunch}</dt>
          <dd>
            {profile.lastLaunch
              ? `${profile.lastLaunch.outcome === 'started' ? '✓' : '✗'} ${relativeTime(profile.lastLaunch.at)}`
              : ui.common.never}
          </dd>
          <dt>{ui.details.created}</dt>
          <dd>{dateTime(profile.createdAt)}</dd>
        </dl>

        <div className="button-row">
          {profile.dataDirectory && (
            <Button icon={<FolderOpen className="icon" aria-hidden="true" />} onClick={openFolder}>
              {ui.details.openFolder}
            </Button>
          )}
          {app?.supportsVerification && (
            <Button
              icon={<BadgeCheck className="icon" aria-hidden="true" />}
              onClick={() => void verify()}
              loading={verifying}
              disabled={!compatibility.launch.available}
            >
              {verifying ? ui.details.verifying : ui.details.verify}
            </Button>
          )}
        </div>
        {app?.supportsVerification && <p className="field-help">{ui.details.verifyHelp}</p>}
        {app?.experimental && profile.storage.kind !== 'app-default' && (
          <ManualCheck profile={profile} version={app.detection.version} />
        )}
        {verifyError && <ErrorPanel error={verifyError} compact />}
        {verification && <VerificationResult report={verification} />}

        {app?.supportsCopyCommand && shells.length > 0 && (
          <section className="copy-command">
            <h3>{ui.details.copyCommandTitle}</h3>
            <p className="field-help">{ui.details.copyCommandHelp}</p>
            <div className="button-row">
              <label className="inline-field">
                <span>{ui.details.shellLabel}</span>
                <select
                  value={shell}
                  onChange={(event) => setShell(event.target.value as CommandShell)}
                >
                  {shells.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {ui.details.shells[candidate]}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                icon={<ClipboardCopy className="icon" aria-hidden="true" />}
                loading={busy === 'copy'}
                disabled={!compatibility.launch.available}
                onClick={() => void copyCommand(shell)}
              >
                {ui.dashboard.copyCommand}
              </Button>
            </div>
            {(shell === 'powershell' || shell === 'cmd') && (
              <p className="field-help">{ui.details.sessionScoped}</p>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
