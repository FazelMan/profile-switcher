import { useState } from 'react';
import { BadgeCheck, ClipboardCopy, FolderOpen, Play, ShieldAlert } from 'lucide-react';
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
      className={`verification ${report.configDirectoryMatches ? 'tone-ok' : 'tone-warn'}`}
      aria-live="polite"
    >
      <h3>
        {report.configDirectoryMatches ? (
          <BadgeCheck className="icon" aria-hidden="true" />
        ) : (
          <ShieldAlert className="icon" aria-hidden="true" />
        )}
        {ui.details.verificationTitle}
      </h3>
      <p>
        {report.configDirectoryMatches
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
  const { busy, launch, copyCommand } = useProfileActions(profile, app);
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
            loading={busy === 'launch'}
            onClick={() => void launch()}
          >
            {compatibility.launch.isolation === 'shared'
              ? ui.dashboard.launchShared
              : ui.dashboard.launch}
          </Button>
        </>
      }
    >
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
          <dd>{app ? message(app.mechanism) : ui.common.unknown}</dd>
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
