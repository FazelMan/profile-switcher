import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/ipc';

const exposed: Record<string, unknown> = {};
const invoke = vi.fn(async (...args: unknown[]) => ({ ok: true, value: args }));
const windowHandlers: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (key: string, value: unknown) => (exposed[key] = value) },
  ipcRenderer: { invoke },
  BrowserWindow: function BrowserWindow() {},
  nativeTheme: { shouldUseDarkColors: false },
}));

describe('preload bridge', () => {
  beforeEach(() => invoke.mockClear());

  it('exposes a frozen API with only the contract methods and no raw ipcRenderer', async () => {
    await import('../../src/preload/index');
    const api = exposed.profileSwitcher as Record<string, unknown>;
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.keys(api).sort()).toEqual(
      [
        'getSnapshot',
        'refreshApps',
        'createProfile',
        'updateProfile',
        'deleteProfile',
        'launchProfile',
        'verifyProfile',
        'openProfileDirectory',
        'copyLaunchCommand',
        'updateSettings',
        'chooseDirectory',
        'getDiagnostics',
        'copyDiagnostics',
        'openLogsDirectory',
        'openLink',
        'getRuntime',
        'setManualCheck',
      ].sort(),
    );
    expect(Object.values(api).every((value) => typeof value === 'function')).toBe(true);
    expect(Object.keys(exposed)).toEqual(['profileSwitcher']);
  });

  it('maps each method to its fixed channel', async () => {
    await import('../../src/preload/index');
    const api = exposed.profileSwitcher as Record<string, (...args: unknown[]) => Promise<unknown>>;
    await api.launchProfile!('work-abc', {});
    await api.copyLaunchCommand!('work-abc', 'posix');
    expect(invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.launchProfile, 'work-abc', {});
    expect(invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.copyLaunchCommand, 'work-abc', 'posix');
  });

  it('bundles nothing but electron (required for the sandboxed renderer)', () => {
    const source = readFileSync(path.resolve(__dirname, '../../src/preload/index.ts'), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['electron', '../shared/ipc']);
    const shared = readFileSync(path.resolve(__dirname, '../../src/shared/ipc.ts'), 'utf8');
    expect(shared).not.toMatch(/^import (?!type)/m);
  });
});

describe('BrowserWindow hardening', () => {
  it('trusts only the bundled renderer file in production', async () => {
    const { resolveRendererLocation } = await import('../../src/main/window');
    const location = resolveRendererLocation(undefined, true);
    expect(location.url.startsWith('file://')).toBe(true);
    expect(location.isAppUrl(location.url)).toBe(true);
    expect(location.isAppUrl('file:///etc/passwd')).toBe(false);
    expect(location.isAppUrl('https://claude.ai/')).toBe(false);
    expect(location.isAppUrl('not a url')).toBe(false);
  });

  it('ignores the dev server URL in packaged builds and trusts only its origin in development', async () => {
    const { resolveRendererLocation } = await import('../../src/main/window');
    expect(resolveRendererLocation('http://localhost:5173', true).url.startsWith('file://')).toBe(
      true,
    );
    const dev = resolveRendererLocation('http://localhost:5173/', false);
    expect(dev.isAppUrl('http://localhost:5173/index.html')).toBe(true);
    expect(dev.isAppUrl('http://localhost:5174/')).toBe(false);
  });

  it('denies pop-ups, foreign navigation, and <webview>', async () => {
    const { hardenWebContents, resolveRendererLocation } = await import('../../src/main/window');
    let openHandler: (() => { action: string }) | undefined;
    const contents = {
      setWindowOpenHandler: (handler: () => { action: string }) => (openHandler = handler),
      on: (event: string, handler: (...args: unknown[]) => unknown) =>
        (windowHandlers[event] = handler),
    };
    const location = resolveRendererLocation(undefined, true);
    hardenWebContents(contents as never, location);

    expect(openHandler?.()).toEqual({ action: 'deny' });
    const blocked = { preventDefault: vi.fn() };
    windowHandlers['will-navigate']!(blocked, 'https://evil.example/');
    expect(blocked.preventDefault).toHaveBeenCalled();
    const allowed = { preventDefault: vi.fn() };
    windowHandlers['will-navigate']!(allowed, location.url);
    expect(allowed.preventDefault).not.toHaveBeenCalled();
    const webview = { preventDefault: vi.fn() };
    windowHandlers['will-attach-webview']!(webview);
    expect(webview.preventDefault).toHaveBeenCalled();
  });

  it('creates windows with isolation, sandbox, and no Node integration', () => {
    const source = readFileSync(path.resolve(__dirname, '../../src/main/window.ts'), 'utf8');
    for (const setting of [
      'contextIsolation: true',
      'nodeIntegration: false',
      'sandbox: true',
      'webSecurity: true',
      'allowRunningInsecureContent: false',
      'webviewTag: false',
    ]) {
      expect(source).toContain(setting);
    }
  });
});
