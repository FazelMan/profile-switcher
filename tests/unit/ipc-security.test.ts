import { describe, expect, it, vi } from 'vitest';
import { AppFailure } from '../../src/shared/domain/errors';
import { IPC_CHANNELS, type IpcChannel } from '../../src/shared/ipc';
import {
  createSenderValidator,
  registerIpcHandlers,
  type IpcEventLike,
  type IpcHandlers,
} from '../../src/main/ipc/register';
import { nullLogger } from '../helpers/fake-system';

type Listener = (event: IpcEventLike, ...args: unknown[]) => Promise<unknown>;

const APP_URL = 'file:///opt/profile-switcher/resources/app.asar/out/renderer/index.html';
const WINDOW_ID = 7;

function setup(
  overrides: Partial<Record<IpcChannel, (...args: never[]) => Promise<unknown>>> = {},
) {
  const listeners = new Map<string, Listener>();
  const calls: Array<{ channel: string; args: unknown[] }> = [];
  const handlers = Object.fromEntries(
    Object.values(IPC_CHANNELS).map((channel) => [
      channel,
      vi.fn(async (...args: unknown[]) => {
        calls.push({ channel, args });
        return { handled: channel };
      }),
    ]),
  ) as unknown as IpcHandlers;
  Object.assign(handlers, overrides);
  registerIpcHandlers({
    ipcMain: { handle: (channel, listener) => listeners.set(channel, listener) },
    handlers,
    isTrustedSender: createSenderValidator({
      getWebContentsId: () => WINDOW_ID,
      isAllowedUrl: (url) => url === APP_URL,
    }),
    logger: nullLogger,
  });
  const invoke = (channel: string, event: IpcEventLike, ...args: unknown[]) =>
    listeners.get(channel)!(event, ...args);
  return { listeners, calls, invoke };
}

const trusted: IpcEventLike = {
  sender: { id: WINDOW_ID },
  senderFrame: { url: APP_URL, parent: null },
};

describe('IPC registration', () => {
  it('registers exactly the channels in the contract', () => {
    const { listeners } = setup();
    expect([...listeners.keys()].sort()).toEqual(Object.values(IPC_CHANNELS).sort());
  });

  it('runs handlers for the trusted window and wraps results', async () => {
    const { invoke } = setup();
    await expect(invoke('snapshot:get', trusted)).resolves.toEqual({
      ok: true,
      value: { handled: 'snapshot:get' },
    });
  });
});

describe('IPC sender validation', () => {
  const untrusted: Array<[string, IpcEventLike]> = [
    ['another WebContents', { sender: { id: 99 }, senderFrame: { url: APP_URL, parent: null } }],
    ['a sub-frame', { sender: { id: WINDOW_ID }, senderFrame: { url: APP_URL, parent: {} } }],
    [
      'a navigated-away page',
      { sender: { id: WINDOW_ID }, senderFrame: { url: 'https://evil.example/', parent: null } },
    ],
    [
      'a different local file',
      { sender: { id: WINDOW_ID }, senderFrame: { url: 'file:///tmp/evil.html', parent: null } },
    ],
    ['a destroyed frame', { sender: { id: WINDOW_ID }, senderFrame: null }],
  ];

  it.each(untrusted)('rejects %s without calling the handler', async (_label, event) => {
    const { invoke, calls } = setup();
    for (const channel of Object.values(IPC_CHANNELS)) {
      await expect(invoke(channel, event)).resolves.toEqual({
        ok: false,
        error: { code: 'FORBIDDEN_SENDER' },
      });
    }
    expect(calls).toHaveLength(0);
  });

  it('rejects everything when the main window is gone', async () => {
    const listeners = new Map<string, Listener>();
    registerIpcHandlers({
      ipcMain: { handle: (channel, listener) => listeners.set(channel, listener) },
      handlers: {} as IpcHandlers,
      isTrustedSender: createSenderValidator({
        getWebContentsId: () => null,
        isAllowedUrl: () => true,
      }),
      logger: nullLogger,
    });
    await expect(listeners.get('snapshot:get')!(trusted)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN_SENDER' },
    });
  });
});

describe('IPC argument validation', () => {
  const invalid: Array<[string, unknown[]]> = [
    ['profiles:launch', []],
    ['profiles:launch', ['../../etc']],
    ['profiles:launch', ['work-abc', 'extra']],
    ['profiles:launch', [{ id: 'work-abc' }]],
    ['profiles:delete', ['WORK']],
    ['profiles:open-directory', ['/etc']],
    ['profiles:copy-command', ['work-abc', 'zsh; rm -rf /']],
    [
      'profiles:create',
      [
        {
          name: 'x',
          appId: 'claude-code',
          color: 'blue',
          storage: { kind: 'managed' },
          executable: '/bin/sh',
        },
      ],
    ],
    [
      'profiles:create',
      [
        {
          name: 'x',
          appId: 'claude-code',
          color: 'blue',
          storage: { kind: 'custom', path: 'relative\n' },
        },
      ],
    ],
    ['profiles:update', [{ id: 'work-abc', storage: { kind: 'custom', path: '/' } }]],
    ['settings:update', [{ theme: 'neon' }]],
    ['settings:update', [{ telemetry: true }]],
    ['dialog:choose-directory', ['/etc']],
    ['links:open', ['https://evil.example']],
    ['links:open', ['__proto__']],
    ['snapshot:get', ['unexpected']],
  ];

  it.each(invalid)('%s rejects %j before the handler runs', async (channel, args) => {
    const { invoke, calls } = setup();
    const result = (await invoke(channel, trusted, ...args)) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_FAILED');
    expect(calls).toHaveLength(0);
  });

  it('passes parsed (trimmed, defaulted) arguments to handlers', async () => {
    const { invoke, calls } = setup();
    await invoke('profiles:create', trusted, {
      name: '  Work ',
      appId: 'claude-code',
      color: 'blue',
      storage: { kind: 'managed' },
    });
    expect(calls[0]?.args[0]).toEqual({
      name: 'Work',
      appId: 'claude-code',
      color: 'blue',
      description: '',
      storage: { kind: 'managed' },
      launch: {},
    });
  });
});

describe('IPC error conversion', () => {
  it('returns AppFailure details as a structured error', async () => {
    const { invoke } = setup({
      'profiles:launch': async () => {
        throw new AppFailure('LAUNCH_FAILED', undefined, 'spawn failed: ENOENT');
      },
    });
    await expect(invoke('profiles:launch', trusted, 'work-abc')).resolves.toEqual({
      ok: false,
      error: { code: 'LAUNCH_FAILED', detail: 'spawn failed: ENOENT' },
    });
  });

  it('hides unexpected exceptions behind INTERNAL_ERROR with no stack trace', async () => {
    const { invoke } = setup({
      'profiles:launch': async () => {
        throw new Error('boom at /home/ana/secret with sk-ant-123');
      },
    });
    const result = await invoke('profiles:launch', trusted, 'work-abc');
    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(result)).not.toMatch(/boom|sk-ant|stack/);
  });
});
