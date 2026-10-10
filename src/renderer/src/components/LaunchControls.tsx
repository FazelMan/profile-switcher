import { ClipboardCopy, FlaskConical, Monitor, Play, SquareTerminal } from 'lucide-react';
import type { AppSummary } from '@shared/domain/compatibility';
import type { ProfileView } from '@shared/ipc';
import type { useProfileActions } from '../hooks/useProfileActions';
import { useI18n } from '../i18n';
import { useController } from '../state';
import { Button } from './Button';
import { Modal } from './Modal';
import { SwitchDialog } from './SwitchDialog';

type Actions = ReturnType<typeof useProfileActions>;

/**
 * The launch buttons for a profile. Profiles whose application has a desktop
 * companion (Claude Code → Claude Desktop) get two buttons, Terminal and
 * Desktop, both using this profile's account.
 */
export function LaunchControls({
  profile,
  app,
  actions,
  describedBy,
}: {
  profile: ProfileView;
  app: AppSummary | undefined;
  actions: Actions;
  describedBy?: string;
}) {
  const { ui } = useI18n();
  const { snapshot } = useController();
  const { compatibility } = profile;
  const { busy, primary, launch } = actions;
  const copyMode =
    app?.kind === 'cli' &&
    app.supportsCopyCommand &&
    snapshot?.settings.cliLaunchBehavior === 'copy-command';
  const companion = app?.desktopCompanion?.available ? app.desktopCompanion : null;
  const disabled = !compatibility.launch.available;

  if (!companion) {
    const label = copyMode
      ? ui.dashboard.copyCommand
      : compatibility.launch.isolation === 'shared'
        ? ui.dashboard.launchShared
        : ui.dashboard.launch;
    return (
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
        disabled={disabled}
        onClick={() => void primary()}
        aria-describedby={describedBy}
      >
        {busy === 'launch' ? ui.dashboard.launching : label}
      </Button>
    );
  }

  return (
    <div className="launch-pair" role="group" aria-label={ui.dashboard.openIn}>
      <Button
        variant="primary"
        icon={
          copyMode ? (
            <ClipboardCopy className="icon" aria-hidden="true" />
          ) : (
            <SquareTerminal className="icon" aria-hidden="true" />
          )
        }
        loading={busy === 'launch' || busy === 'copy' || busy === 'switch'}
        disabled={disabled || busy !== null}
        onClick={() => void primary()}
        aria-describedby={describedBy}
        title={ui.dashboard.terminalHelp}
      >
        {copyMode ? ui.dashboard.copyCommand : ui.dashboard.openTerminal}
      </Button>
      <Button
        variant="primary"
        icon={<Monitor className="icon" aria-hidden="true" />}
        loading={busy === 'desktop'}
        disabled={disabled || busy !== null}
        onClick={() => void launch('desktop')}
        aria-describedby={describedBy}
        title={ui.dashboard.desktopHelp}
      >
        {ui.dashboard.openDesktop}
      </Button>
    </div>
  );
}

/** Dialogs a launch may need: Switch-mode confirmation and the Claude Desktop opt-in. */
export function LaunchDialogs({
  profile,
  app,
  actions,
}: {
  profile: ProfileView;
  app: AppSummary | undefined;
  actions: Actions;
}) {
  const { ui, format } = useI18n();
  const { busy, pendingSwitch, resolveSwitch, cancelSwitch, desktopOptIn } = actions;
  return (
    <>
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
      {desktopOptIn && (
        <Modal
          open
          title={format(ui.desktopOptIn.title, { name: profile.name })}
          onClose={actions.cancelDesktopOptIn}
          footer={
            <>
              <Button variant="ghost" onClick={actions.cancelDesktopOptIn} autoFocus>
                {ui.common.cancel}
              </Button>
              <Button
                variant="primary"
                icon={<FlaskConical className="icon" aria-hidden="true" />}
                onClick={() => void actions.confirmDesktopOptIn()}
              >
                {ui.desktopOptIn.confirm}
              </Button>
            </>
          }
        >
          <div className="switch-dialog">
            <p>{ui.desktopOptIn.body}</p>
            <div className="callout tone-warn">
              <p>{ui.settings.claudeDesktopIsolationHelp}</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
