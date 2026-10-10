import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRegistry } from '../../src/main/adapters/registry';
import type { LaunchPlan } from '../../src/main/adapters/types';
import type { Launcher } from '../../src/main/launch/launcher';
import { resolveAppPaths, type AppPaths } from '../../src/main/paths';
import { ProfileService } from '../../src/main/profiles/profile-service';
import { ProcessCloser } from '../../src/main/runtime/process-closer';
import { ProcessTracker } from '../../src/main/runtime/process-tracker';
import { MetadataStore } from '../../src/main/storage/metadata-store';
import { nodeFileProbe, type FileProbe, type SystemContext } from '../../src/main/system';
import { createProfileInputSchema, type CreateProfileInput } from '../../src/shared/domain/profile';
import type { LaunchReport } from '../../src/shared/ipc';
import { fakeProcesses, fakeRunner, nullLogger, realFsSystem } from '../helpers/fake-system';

/**
 * Switch mode and experimental Claude Desktop profiles, through the real
 * ProfileService, ProcessTracker, and ProcessCloser. Processes are an
 * in-memory table: a launch adds a row, a quit request removes it (unless
 * the test makes the process ignore it).
 */
const isWindows = process.platform === 'win32';
let root: string;
let home: string;
let paths: AppPaths;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ps-switch-'));
  home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, isWindows ? 'claude.exe' : 'claude'), '#!/bin/sh\n', {
    mode: 0o755,
  });
  paths = resolveAppPaths({
    platform: process.platform,
    homeDir: home,
    env: { PROFILE_SWITCHER_DATA_DIR: path.join(root, 'data') },
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

interface Harness {
  svc: ProfileService;
  table: ReturnType<typeof fakeProcesses>['table'];
  plans: LaunchPlan[];
  quitRequests: number[];
  ignoreQuit: Set<number>;
}

async function harness(overrides: Partial<SystemContext> = {}): Promise<Harness> {
  const processes = fakeProcesses({});
  const plans: LaunchPlan[] = [];
  const quitRequests: number[] = [];
  const ignoreQuit = new Set<number>();
  let nextPid = 1000;
  const launcher = {
    async launch(plan: LaunchPlan, context: { launchId: string }): Promise<LaunchReport> {
      plans.push(plan);
      const pid = nextPid++;
      if (plan.type === 'cli') processes.table[pid] = { commandLine: plan.executable };
      else
        processes.table[pid] = {
          commandLine: `${plan.target}/Contents/MacOS/Claude ${plan.args.join(' ')}`,
        };
      return {
        launchId: context.launchId,
        closedProfileIds: [],
        tracking: plan.type === 'cli' ? 'child' : 'marker',
        method: plan.type === 'cli' ? 'terminal' : 'direct',
        isolation: plan.isolation,
        terminal: null,
        pid: plan.type === 'cli' ? pid : null,
        notes: [],
      };
    },
  } as unknown as Launcher;
  const system = realFsSystem(home, {
    env: { PATH: path.join(root, 'bin'), HOME: home },
    runner: fakeRunner(() => ({ exitCode: 0, stdout: '2.1.0 (Claude Code)' })),
    processes,
    ...overrides,
  });
  const svc = new ProfileService({
    store: new MetadataStore({ filePath: paths.metadataFile, logger: nullLogger }),
    registry: createDefaultRegistry(),
    system,
    paths,
    launcher,
    tracker: new ProcessTracker(system, paths.runtimeDir, nullLogger),
    closer: new ProcessCloser({
      requestQuit: async (pid) => {
        quitRequests.push(pid);
        if (!ignoreQuit.has(pid)) Reflect.deleteProperty(processes.table, pid);
        return true;
      },
      processes,
      logger: nullLogger,
      timeoutMs: 50,
      pollMs: 5,
    }),
    logger: nullLogger,
    randomBytes: (n) => randomBytes(n),
    appInfo: {
      name: 'Profile Switcher',
      version: '0.0.0-test',
      appId: 'test',
      electron: '0',
      chrome: '0',
      node: '0',
    },
  });
  await svc.initialize();
  return { svc, table: processes.table, plans, quitRequests, ignoreQuit };
}

function input(overrides: Partial<CreateProfileInput> = {}) {
  return createProfileInputSchema.parse({
    name: 'Work',
    appId: 'claude-code',
    color: 'blue',
    storage: { kind: 'managed' },
    ...overrides,
  });
}

async function launched(svc: ProfileService, id: string, request = {}) {
  const outcome = await svc.launch(id, request);
  if (outcome.kind !== 'launched') throw new Error(`expected a launch, got ${outcome.kind}`);
  return outcome.report;
}

describe('launch modes', () => {
  it('Concurrent (the default) launches alongside running profiles and closes nothing', async () => {
    const { svc, quitRequests, table } = await harness();
    const personal = await svc.create(input({ name: 'Personal' }));
    const work = await svc.create(input({ name: 'Work' }));
    await launched(svc, personal);
    await launched(svc, work);
    expect(quitRequests).toEqual([]);
    expect(Object.keys(table)).toHaveLength(2);
    const runtime = await svc.runtime();
    expect(runtime[personal]?.[0]?.state).toBe('running');
    expect(runtime[work]?.[0]?.state).toBe('running');
  });

  it('Switch asks first: nothing is launched or closed until the user decides', async () => {
    const { svc, plans, quitRequests } = await harness();
    await svc.updateSettings({ launchModes: { 'claude-code': 'switch' } });
    const personal = await svc.create(input({ name: 'Personal' }));
    const work = await svc.create(input({ name: 'Work' }));
    const first = await launched(svc, personal);

    const outcome = await svc.launch(work);
    expect(outcome).toEqual({
      kind: 'confirm-switch',
      running: [{ profileId: personal, launchId: first.launchId, pid: 1000 }],
      untrackedProfileIds: [],
    });
    expect(plans).toHaveLength(1);
    expect(quitRequests).toEqual([]);
  });

  it('Switch closes exactly the confirmed instances, then launches', async () => {
    const { svc, quitRequests, table } = await harness();
    await svc.updateSettings({ launchModes: { 'claude-code': 'switch' } });
    const personal = await svc.create(input({ name: 'Personal' }));
    const work = await svc.create(input({ name: 'Work' }));
    const first = await launched(svc, personal);

    const report = await launched(svc, work, {
      switch: { action: 'close', launchIds: [first.launchId] },
    });
    expect(quitRequests).toEqual([1000]);
    expect(report.closedProfileIds).toEqual([personal]);
    expect(table[1000]).toBeUndefined();
    const runtime = await svc.runtime();
    expect(runtime[personal]).toBeUndefined();
    expect(runtime[work]?.[0]?.state).toBe('running');
  });

  it('Switch never touches the same profile, other applications, or instances that appeared later', async () => {
    const { svc, quitRequests } = await harness();
    await svc.updateSettings({ launchModes: { 'claude-code': 'switch' } });
    const personal = await svc.create(input({ name: 'Personal' }));
    const work = await svc.create(input({ name: 'Work' }));
    const client = await svc.create(input({ name: 'Client' }));
    const p = await launched(svc, personal);
    // Client starts after the user saw the confirmation listing Personal only.
    await launched(svc, client, { switch: { action: 'keep' } });
    await launched(svc, work, { switch: { action: 'close', launchIds: [p.launchId] } });
    expect(quitRequests).toEqual([1000]);
    const runtime = await svc.runtime();
    expect(runtime[client]?.[0]?.state).toBe('running');

    // The target profile's own instance cannot be passed in as something to close.
    const w = (await svc.runtime())[work]![0]!;
    await expect(
      svc.launch(work, { switch: { action: 'close', launchIds: [w.launchId] } }),
    ).rejects.toMatchObject({ appError: { code: 'VALIDATION_FAILED' } });
    expect(quitRequests).toEqual([1000]);
  });

  it('does not launch when a confirmed instance refuses to quit, and leaves it running', async () => {
    const { svc, ignoreQuit, plans, table } = await harness();
    await svc.updateSettings({ launchModes: { 'claude-code': 'switch' } });
    const personal = await svc.create(input({ name: 'Personal' }));
    const work = await svc.create(input({ name: 'Work' }));
    const first = await launched(svc, personal);
    ignoreQuit.add(1000);
    await expect(
      svc.launch(work, { switch: { action: 'close', launchIds: [first.launchId] } }),
    ).rejects.toMatchObject({
      appError: { code: 'SWITCH_CLOSE_FAILED', params: { names: 'Personal' } },
    });
    expect(plans).toHaveLength(1);
    expect(table[1000]).toBeDefined();
  });

  it('"Open alongside" in Switch mode launches without closing anything', async () => {
    const { svc, quitRequests } = await harness();
    await svc.updateSettings({ launchModes: { 'claude-code': 'switch' } });
    const personal = await svc.create(input({ name: 'Personal' }));
    const work = await svc.create(input({ name: 'Work' }));
    await launched(svc, personal);
    await launched(svc, work, { switch: { action: 'keep' } });
    expect(quitRequests).toEqual([]);
  });

  it('merges launch-mode updates per application and rejects unknown applications', async () => {
    const { svc } = await harness();
    await svc.updateSettings({ launchModes: { 'claude-code': 'switch' } });
    await svc.updateSettings({ launchModes: { 'claude-desktop': 'switch' } });
    await svc.updateSettings({ theme: 'dark' });
    expect(svc.settings().launchModes).toEqual({
      'claude-code': 'switch',
      'claude-desktop': 'switch',
    });
    await expect(
      svc.updateSettings({ launchModes: { 'not-an-app': 'switch' } }),
    ).rejects.toMatchObject({ appError: { code: 'VALIDATION_FAILED' } });
  });
});

/** Real files for everything except a fake /Applications/Claude.app. */
function withClaudeApp(version: string): { files: FileProbe; setVersion(v: string): void } {
  let current = version;
  const bundle = '/Applications/Claude.app';
  return {
    setVersion: (v) => {
      current = v;
    },
    files: {
      ...nodeFileProbe,
      async stat(p) {
        if (p === bundle) return { isFile: false, isDirectory: true };
        if (p.startsWith('/Applications/')) return null;
        return nodeFileProbe.stat(p);
      },
      async readTextFile(p, max) {
        if (p === `${bundle}/Contents/Info.plist`)
          return `<key>CFBundleShortVersionString</key><string>${current}</string>`;
        return nodeFileProbe.readTextFile(p, max);
      },
    },
  };
}

describe.skipIf(isWindows)('experimental Claude Desktop profiles (macOS rules)', () => {
  const desktopInput = (name: string) =>
    input({ name, appId: 'claude-desktop', storage: { kind: 'managed' } });

  it('offers separate folders only after the feature is turned on', async () => {
    const app = withClaudeApp('0.14.10');
    const { svc } = await harness({ platform: 'darwin', files: app.files });
    let snapshot = await svc.snapshot();
    const desktop = () => snapshot.apps.find((a) => a.id === 'claude-desktop')!;
    expect(desktop().storageKinds).toEqual(['app-default']);
    expect(desktop().experimental).toMatchObject({ enabled: false });
    await expect(svc.create(desktopInput('Work'))).rejects.toMatchObject({
      appError: { code: 'STORAGE_KIND_NOT_SUPPORTED' },
    });

    await svc.updateSettings({ experimental: { claudeDesktopIsolation: true } });
    snapshot = await svc.snapshot();
    expect(desktop().storageKinds).toEqual(['app-default', 'managed', 'custom']);
    expect(desktop().defaultStorageKind).toBe('managed');
    const id = await svc.create(desktopInput('Work'));
    const view = (await svc.snapshot()).profiles.find((p) => p.id === id)!;
    expect(view.compatibility.state).toBe('NeedsVerification');
    expect(view.compatibility.launch).toEqual({ available: true, isolation: 'experimental' });
  });

  it('runs two Claude Desktop profiles side by side, each with its own folder argument', async () => {
    const app = withClaudeApp('0.14.10');
    const { svc, plans } = await harness({ platform: 'darwin', files: app.files });
    await svc.updateSettings({ experimental: { claudeDesktopIsolation: true } });
    const personal = await svc.create(desktopInput('Personal'));
    const work = await svc.create(desktopInput('Work'));
    await launched(svc, personal);
    await launched(svc, work);
    const dirs = (await svc.snapshot()).profiles.map((p) => p.dataDirectory);
    expect(plans.map((plan) => (plan.type === 'desktop' ? plan.args : []))).toEqual(
      dirs.map((dir) => [`--user-data-dir=${dir}`]),
    );
    const runtime = await svc.runtime();
    expect(runtime[personal]?.[0]).toMatchObject({ state: 'running', configDirectory: 'verified' });
    expect(runtime[work]?.[0]).toMatchObject({ state: 'running', configDirectory: 'verified' });
  });

  it('turning the feature off disables those profiles instead of opening the shared account', async () => {
    const app = withClaudeApp('0.14.10');
    const { svc, plans } = await harness({ platform: 'darwin', files: app.files });
    await svc.updateSettings({ experimental: { claudeDesktopIsolation: true } });
    const id = await svc.create(desktopInput('Work'));
    await svc.updateSettings({ experimental: { claudeDesktopIsolation: false } });
    const view = (await svc.snapshot()).profiles.find((p) => p.id === id)!;
    expect(view.compatibility.launch.available).toBe(false);
    await expect(svc.launch(id)).rejects.toMatchObject({
      appError: { code: 'LAUNCH_NOT_AVAILABLE' },
    });
    expect(plans).toEqual([]);
  });

  it('records the user’s own check for the installed version and asks again after an update', async () => {
    const app = withClaudeApp('0.14.10');
    const { svc } = await harness({ platform: 'darwin', files: app.files });
    await svc.updateSettings({ experimental: { claudeDesktopIsolation: true } });
    const id = await svc.create(desktopInput('Work'));
    await svc.setManualCheck(id, true);
    let view = (await svc.snapshot()).profiles.find((p) => p.id === id)!;
    expect(view.manualCheck).toMatchObject({ appVersion: '0.14.10' });
    expect(view.compatibility.state).toBe('Supported');
    expect(view.compatibility.launch.isolation).toBe('experimental');

    app.setVersion('0.15.0');
    await svc.refreshDetection();
    view = (await svc.snapshot()).profiles.find((p) => p.id === id)!;
    expect(view.compatibility.state).toBe('NeedsVerification');

    await svc.setManualCheck(id, false);
    view = (await svc.snapshot()).profiles.find((p) => p.id === id)!;
    expect(view.manualCheck).toBeNull();
  });

  it('refuses a manual check for profiles that are not experimental', async () => {
    const { svc } = await harness();
    const id = await svc.create(input());
    await expect(svc.setManualCheck(id, true)).rejects.toMatchObject({
      appError: { code: 'VALIDATION_FAILED' },
    });
  });

  it('Switch mode closes the other Claude Desktop profile after confirmation', async () => {
    const app = withClaudeApp('0.14.10');
    const { svc, quitRequests } = await harness({ platform: 'darwin', files: app.files });
    await svc.updateSettings({
      experimental: { claudeDesktopIsolation: true },
      launchModes: { 'claude-desktop': 'switch' },
    });
    const personal = await svc.create(desktopInput('Personal'));
    const work = await svc.create(desktopInput('Work'));
    await launched(svc, personal);
    await svc.runtime();
    const outcome = await svc.launch(work);
    expect(outcome.kind).toBe('confirm-switch');
    if (outcome.kind !== 'confirm-switch') return;
    await launched(svc, work, {
      switch: { action: 'close', launchIds: outcome.running.map((r) => r.launchId) },
    });
    expect(quitRequests).toEqual([1000]);
  });
});

describe('IPC handler', () => {
  it('returns confirm-switch without a snapshot and launched results with one', async () => {
    const { createIpcHandlers } = await import('../../src/main/ipc/handlers');
    const { createRedactor } = await import('../../src/main/diagnostics/redact');
    const { svc } = await harness();
    await svc.updateSettings({ launchModes: { 'claude-code': 'switch' } });
    const personal = await svc.create(input({ name: 'Personal' }));
    const work = await svc.create(input({ name: 'Work' }));
    const handlers = createIpcHandlers({
      service: svc,
      desktop: {
        chooseDirectory: vi.fn(),
        openPath: vi.fn(),
        openExternal: vi.fn(),
        writeClipboard: vi.fn(),
        applyTheme: vi.fn(),
        applyLanguage: vi.fn(),
      },
      system: realFsSystem(home),
      paths,
      redactor: createRedactor(home),
      logger: nullLogger,
    });
    await expect(handlers['profiles:launch'](personal, {})).resolves.toMatchObject({
      kind: 'launched',
      snapshot: expect.any(Object),
    });
    await expect(handlers['profiles:launch'](work, {})).resolves.toMatchObject({
      kind: 'confirm-switch',
    });
  });
});
