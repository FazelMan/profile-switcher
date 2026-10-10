import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, nativeTheme, type WebContents } from 'electron';
import { APP_IDENTITY } from '@shared/app-identity';

export interface RendererLocation {
  /** URL loaded into the window. */
  url: string;
  /** Whether a URL belongs to the app's own renderer (navigation/IPC allow-list). */
  isAppUrl(url: string): boolean;
}

/**
 * In development electron-vite serves the renderer over HTTP; in production
 * it is a local file inside the app bundle. Only that exact origin/file is
 * trusted.
 */
export function resolveRendererLocation(
  devServerUrl: string | undefined,
  isPackaged: boolean,
): RendererLocation {
  if (devServerUrl && !isPackaged) {
    const origin = new URL(devServerUrl).origin;
    return {
      url: devServerUrl,
      isAppUrl: (candidate) => {
        try {
          return new URL(candidate).origin === origin;
        } catch {
          return false;
        }
      },
    };
  }
  const file = pathToFileURL(path.join(__dirname, '../renderer/index.html'));
  return {
    url: file.toString(),
    isAppUrl: (candidate) => {
      try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'file:' && parsed.pathname === file.pathname;
      } catch {
        return false;
      }
    },
  };
}

export function hardenWebContents(contents: WebContents, location: RendererLocation): void {
  // No new windows, ever. External links go through the allow-listed
  // `links:open` IPC channel instead.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const blockForeignNavigation = (event: { preventDefault(): void }, url: string) => {
    if (!location.isAppUrl(url)) event.preventDefault();
  };
  contents.on('will-navigate', blockForeignNavigation);
  contents.on('will-redirect', blockForeignNavigation);
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

export function createMainWindow(
  location: RendererLocation,
  options: { devTools: boolean },
): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_IDENTITY.productName,
    width: 1120,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111318' : '#f7f7f8',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      webviewTag: false,
      devTools: options.devTools,
    },
  });

  // Navigation hardening is applied to every WebContents through the
  // app-wide 'web-contents-created' hook registered in index.ts.
  window.once('ready-to-show', () => window.show());
  void window.loadURL(location.url);
  return window;
}
