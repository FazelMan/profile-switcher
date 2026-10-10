import { AppFailure } from '@shared/domain/errors';
import type { Language } from '@shared/domain/settings';
import type { DirectoryChoice, LaunchResult } from '@shared/ipc';
import { buildDiagnosticsReport } from '../diagnostics/report';
import type { Redactor } from '../diagnostics/redact';
import type { Logger } from '../diagnostics/logger';
import { resolveExternalLink } from '../external-links';
import type { AppPaths } from '../paths';
import type { ProfileService } from '../profiles/profile-service';
import type { SystemContext } from '../system';
import type { IpcHandlers } from './register';

/** OS integrations the handlers need, injected so they can be faked in tests. */
export interface DesktopIntegration {
  chooseDirectory(purpose: 'profile-data' | 'working-directory'): Promise<string | null>;
  /** Resolves to an empty string on success, or an error description. */
  openPath(path: string): Promise<string>;
  openExternal(url: string): Promise<void>;
  writeClipboard(text: string): void;
  applyTheme(theme: 'system' | 'light' | 'dark'): void;
  /** Rebuilds native UI (menu, dialog titles) in the chosen language. */
  applyLanguage(language: Language): void;
}

export interface HandlerDeps {
  service: ProfileService;
  desktop: DesktopIntegration;
  system: SystemContext;
  paths: AppPaths;
  redactor: Redactor;
  logger: Logger;
}

export function createIpcHandlers({
  service,
  desktop,
  system,
  paths,
  redactor,
}: HandlerDeps): IpcHandlers {
  const openDirectory = async (dir: string) => {
    const error = await desktop.openPath(dir);
    if (error) throw new AppFailure('OPEN_FOLDER_FAILED', undefined, redactor.text(error));
    return null;
  };

  return {
    'snapshot:get': () => service.snapshot(),
    'apps:refresh': async () => {
      await service.refreshDetection();
      return service.snapshot();
    },
    'profiles:create': async (input) => {
      const profileId = await service.create(input);
      return { snapshot: await service.snapshot(), profileId };
    },
    'profiles:update': async (input) => {
      await service.update(input);
      return service.snapshot();
    },
    'profiles:delete': async (id) => {
      const retainedDirectory = await service.delete(id);
      return { snapshot: await service.snapshot(), retainedDirectory };
    },
    'profiles:launch': async (id, request): Promise<LaunchResult> => {
      const outcome = await service.launch(id, request);
      if (outcome.kind === 'confirm-switch') return outcome;
      return { kind: 'launched', snapshot: await service.snapshot(), report: outcome.report };
    },
    'profiles:set-manual-check': async (id, checked) => {
      await service.setManualCheck(id, checked);
      return service.snapshot();
    },
    'profiles:verify': (id) => service.verify(id),
    'profiles:open-directory': async (id) => openDirectory(await service.directoryToOpen(id)),
    'profiles:copy-command': async (id, shell) => {
      const command = await service.copyCommand(id, shell);
      desktop.writeClipboard(command);
      return { command };
    },
    'settings:update': async (patch) => {
      await service.updateSettings(patch);
      if (patch.theme) desktop.applyTheme(patch.theme);
      if (patch.language) desktop.applyLanguage(patch.language);
      return service.snapshot();
    },
    'dialog:choose-directory': async (purpose): Promise<DirectoryChoice | null> => {
      const chosen = await desktop.chooseDirectory(purpose);
      if (!chosen) return null;
      const stat = await system.files.stat(chosen);
      const isEmpty = stat?.isDirectory
        ? ((await system.files.isEmptyDirectory(chosen)) ?? false)
        : true;
      return { path: chosen, exists: stat !== null, isEmpty };
    },
    'diagnostics:get': async () =>
      buildDiagnosticsReport(await service.snapshot(), paths, redactor, new Date()),
    'diagnostics:copy': async () => {
      const report = buildDiagnosticsReport(await service.snapshot(), paths, redactor, new Date());
      desktop.writeClipboard(report.text);
      return null;
    },
    'diagnostics:open-logs': async () => openDirectory(paths.logsDir),
    'runtime:get': () => service.runtime(),
    'links:open': async (id) => {
      await desktop.openExternal(
        resolveExternalLink(id as Parameters<typeof resolveExternalLink>[0]),
      );
      return null;
    },
  };
}
