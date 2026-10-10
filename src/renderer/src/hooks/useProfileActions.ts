import { useCallback, useState } from 'react';
import type { AppSummary, CommandShell } from '@shared/domain/compatibility';
import type { ProfileView } from '@shared/ipc';
import { useI18n } from '../i18n';
import { useController } from '../state';

/** Launch and copy-command actions shared by the dashboard card and the details dialog. */
export function useProfileActions(profile: ProfileView, app: AppSummary | undefined) {
  const { api, call, applySnapshot, notify, snapshot, refreshRuntime } = useController();
  const { ui, format } = useI18n();
  const [busy, setBusy] = useState<'launch' | 'copy' | null>(null);

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

  const launch = useCallback(async () => {
    setBusy('launch');
    const result = await call(() => api.launchProfile(profile.id));
    setBusy(null);
    if (result.ok) {
      applySnapshot(result.value.snapshot);
      const { report } = result.value;
      notify({
        kind: 'success',
        title: report.terminal
          ? format(ui.launch.success, { name: profile.name, terminal: report.terminal })
          : format(ui.launch.successDirect, {
              name: profile.name,
              app: app?.displayName ?? profile.appId,
            }),
      });
      // Pick up the new instance sooner than the regular poll.
      setTimeout(() => void refreshRuntime(), 1_000);
    } else {
      // The failed attempt is recorded on the profile; refresh to show it.
      const refreshed = await api.getSnapshot().catch(() => null);
      if (refreshed?.ok) applySnapshot(refreshed.value);
    }
  }, [
    api,
    app,
    applySnapshot,
    call,
    format,
    notify,
    profile.appId,
    profile.id,
    profile.name,
    refreshRuntime,
    ui.launch,
  ]);

  const primary = useCallback(() => {
    const preferCopy =
      app?.kind === 'cli' &&
      app.supportsCopyCommand &&
      snapshot?.settings.cliLaunchBehavior === 'copy-command';
    return preferCopy ? copyCommand() : launch();
  }, [app, copyCommand, launch, snapshot?.settings.cliLaunchBehavior]);

  return { busy, launch, copyCommand, primary };
}
