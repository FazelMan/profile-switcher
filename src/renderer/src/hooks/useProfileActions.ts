import { useCallback, useState } from 'react';
import type { AppSummary, CommandShell } from '@shared/domain/compatibility';
import type { LaunchRequest, ProfileView, SwitchCandidate } from '@shared/ipc';
import { useI18n } from '../i18n';
import { useController } from '../state';

/** Other running profiles that Switch mode offers to close before launching. */
export interface PendingSwitch {
  running: SwitchCandidate[];
  untrackedProfileIds: string[];
}

/** Launch and copy-command actions shared by the dashboard card and the details dialog. */
export function useProfileActions(profile: ProfileView, app: AppSummary | undefined) {
  const { api, call, applySnapshot, notify, snapshot, refreshRuntime } = useController();
  const { ui, format, list } = useI18n();
  const [busy, setBusy] = useState<'launch' | 'copy' | 'switch' | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);

  const copyCommand = useCallback(
    async (shell?: CommandShell) => {
      const target = shell ?? app?.copyCommandShells[0];
      if (!target) return;
      setBusy('copy');
      const result = await call(() => api.copyLaunchCommand(profile.id, target));
      setBusy(null);
      if (result.ok)
        notify({ kind: 'success', title: format(ui.launch.commandCopied, { name: profile.name }) });
    },
    [api, app, call, format, notify, profile.id, profile.name, ui.launch.commandCopied],
  );

  const launchWith = useCallback(
    async (request: LaunchRequest) => {
      setBusy(request.switch?.action === 'close' ? 'switch' : 'launch');
      const result = await call(() => api.launchProfile(profile.id, request));
      setBusy(null);
      if (!result.ok) {
        setPendingSwitch(null);
        // The failed attempt is recorded on the profile; refresh to show it.
        const refreshed = await api.getSnapshot().catch(() => null);
        if (refreshed?.ok) applySnapshot(refreshed.value);
        return;
      }
      const value = result.value;
      if (value.kind === 'confirm-switch') {
        // Switch mode: nothing was launched or closed; the user decides.
        setPendingSwitch({
          running: value.running,
          untrackedProfileIds: value.untrackedProfileIds,
        });
        return;
      }
      setPendingSwitch(null);
      applySnapshot(value.snapshot);
      const { report } = value;
      const closed = report.closedProfileIds.map(
        (id) => value.snapshot.profiles.find((p) => p.id === id)?.name ?? id,
      );
      notify({
        kind: 'success',
        title:
          closed.length > 0
            ? format(ui.launch.switched, {
                closed: list(closed),
                name: profile.name,
              })
            : report.terminal
              ? format(ui.launch.success, { name: profile.name, terminal: report.terminal })
              : format(ui.launch.successDirect, {
                  name: profile.name,
                  app: app?.displayName ?? profile.appId,
                }),
      });
      // Pick up the new instance sooner than the regular poll.
      setTimeout(() => void refreshRuntime(), 1_000);
    },
    [
      api,
      app,
      applySnapshot,
      call,
      format,
      list,
      notify,
      profile.appId,
      profile.id,
      profile.name,
      refreshRuntime,
      ui.launch,
    ],
  );

  const launch = useCallback(() => launchWith({}), [launchWith]);

  /** Resolves a Switch-mode prompt: close exactly the listed instances, or open alongside them. */
  const resolveSwitch = useCallback(
    (choice: 'close' | 'keep') => {
      if (!pendingSwitch) return Promise.resolve();
      return launchWith(
        choice === 'close'
          ? {
              switch: {
                action: 'close',
                launchIds: pendingSwitch.running.map((instance) => instance.launchId),
              },
            }
          : { switch: { action: 'keep' } },
      );
    },
    [launchWith, pendingSwitch],
  );

  const cancelSwitch = useCallback(() => setPendingSwitch(null), []);

  const primary = useCallback(() => {
    const preferCopy =
      app?.kind === 'cli' &&
      app.supportsCopyCommand &&
      snapshot?.settings.cliLaunchBehavior === 'copy-command';
    return preferCopy ? copyCommand() : launch();
  }, [app, copyCommand, launch, snapshot?.settings.cliLaunchBehavior]);

  return { busy, launch, copyCommand, primary, pendingSwitch, resolveSwitch, cancelSwitch };
}
