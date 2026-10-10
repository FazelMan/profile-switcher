import { randomBytes } from 'node:crypto';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell,
} from 'electron';
import { APP_IDENTITY } from '@shared/app-identity';
import { createDefaultRegistry } from './adapters/registry';
import { createFileLogger, type Logger } from './diagnostics/logger';
import { createRedactor } from './diagnostics/redact';
import { createIpcHandlers, type DesktopIntegration } from './ipc/handlers';
import { createSenderValidator, registerIpcHandlers, type IpcMainLike } from './ipc/register';
import { Launcher } from './launch/launcher';
import { buildApplicationMenu } from './menu';
import { resolveAppPaths } from './paths';
import { ProfileService } from './profiles/profile-service';
import { ProcessTracker } from './runtime/process-tracker';
import { MetadataStore } from './storage/metadata-store';
import { createNodeSystemContext } from './system';
import { createMainWindow, hardenWebContents, resolveRendererLocation } from './window';

const system = createNodeSystemContext();
const paths = resolveAppPaths({
  platform: system.platform,
  homeDir: system.homeDir,
  env: system.env,
});

// Must happen before `ready`: keep Chromium's own session data out of the
// metadata directory, and force the sandbox for every renderer.
app.setPath('userData', paths.electronDataDir);
app.setPath('sessionData', paths.electronDataDir);
// Renderers are always created with `sandbox: true`. Additionally enforce the
// sandbox process-wide, unless Chromium's sandbox was explicitly disabled on
// the command line (required when running as root, e.g. some CI containers),
// where enforcing it would make Chromium's helper processes crash-loop.
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();
if (process.platform === 'win32') app.setAppUserModelId(APP_IDENTITY.appId);

let mainWindow: BrowserWindow | null = null;

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

async function bootstrap(logger: Logger): Promise<void> {
  const redactor = createRedactor(system.homeDir);
  const location = resolveRendererLocation(process.env.ELECTRON_RENDERER_URL, app.isPackaged);

  // Deny every permission request (camera, notifications, geolocation, …):
  // the renderer needs none of them.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  // Chromium's spell checker downloads dictionaries from Google servers.
  // Profile Switcher makes no network requests of its own, so turn it off.
  session.defaultSession.setSpellCheckerEnabled(false);

  const store = new MetadataStore({ filePath: paths.metadataFile, logger });
  const registry = createDefaultRegistry();
  const launcher = new Launcher(system, paths.launchersDir, logger);
  const service = new ProfileService({
    store,
    registry,
    system,
    paths,
    launcher,
    tracker: new ProcessTracker(system, paths.runtimeDir, logger),
    logger,
    randomBytes: (size) => randomBytes(size),
    appInfo: {
      name: APP_IDENTITY.productName,
      version: app.getVersion(),
      appId: APP_IDENTITY.appId,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  });
  await service.initialize();
  nativeTheme.themeSource = service.settings().theme;

  const desktop: DesktopIntegration = {
    async chooseDirectory(purpose) {
      const options: Electron.OpenDialogOptions = {
        title:
          purpose === 'profile-data' ? 'Choose a profile folder' : 'Choose a working directory',
        properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    openPath: (target) => shell.openPath(target),
    openExternal: (url) => shell.openExternal(url),
    writeClipboard: (text) => clipboard.writeText(text),
    applyTheme: (theme) => {
      nativeTheme.themeSource = theme;
    },
  };

  registerIpcHandlers({
    ipcMain: ipcMain as unknown as IpcMainLike,
    handlers: createIpcHandlers({ service, desktop, system, paths, redactor, logger }),
    isTrustedSender: createSenderValidator({
      getWebContentsId: () =>
        mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.id : null,
      isAllowedUrl: (url) => location.isAppUrl(url),
    }),
    logger,
  });

  Menu.setApplicationMenu(buildApplicationMenu({ isPackaged: app.isPackaged }));
  // Every WebContents (the main window and anything Chromium creates later)
  // gets the same navigation, pop-up, and <webview> restrictions.
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents, location));

  const open = () => {
    mainWindow = createMainWindow(location, { devTools: !app.isPackaged });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  };
  open();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) open();
  });
  logger.info('app.ready', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  });
}

if (!app.requestSingleInstanceLock()) {
  // Another instance owns the metadata file; hand focus to it and exit.
  app.quit();
} else {
  const logger = createFileLogger({
    directory: paths.logsDir,
    redactor: createRedactor(system.homeDir),
    echo: !app.isPackaged,
  });

  app.on('second-instance', focusMainWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app
    .whenReady()
    .then(() => bootstrap(logger))
    .catch(async (error: unknown) => {
      logger.error('app.bootstrap-failed', { error });
      await logger.flush();
      dialog.showErrorBox(
        `${APP_IDENTITY.productName} could not start`,
        `Profile Switcher failed to initialize its local data. Details were written to the log folder:\n${paths.logsDir}`,
      );
      app.exit(1);
    });
}
