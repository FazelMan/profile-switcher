import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRegistry } from '../../src/main/adapters/registry';
import type { LaunchPlan } from '../../src/main/adapters/types';
import { createIpcHandlers, type DesktopIntegration } from '../../src/main/ipc/handlers';
import type { Launcher } from '../../src/main/launch/launcher';
import { resolveAppPaths, type AppPaths } from '../../src/main/paths';
import { ProfileService } from '../../src/main/profiles/profile-service';
import { MetadataStore } from '../../src/main/storage/metadata-store';
import { ProcessTracker } from '../../src/main/runtime/process-tracker';
import { createRedactor } from '../../src/main/diagnostics/redact';
import { AppFailure } from '../../src/shared/domain/errors';
import { createProfileInputSchema, type CreateProfileInput } from '../../src/shared/domain/profile';
import type { DiagnosticsReport, LaunchReport } from '../../src/shared/ipc';
import { fakeRunner, nullLogger, realFsSystem } from '../helpers/fake-system';

const isWindows = process.platform === 'win32';
const SECRET = 'sk-ant-integration-secret-value';

let root: string;
let home: string;
let bin: string;
let paths: AppPaths;
let launches: LaunchPlan[];
let launchFailure: AppFailure | null;

const fakeLauncher = {
  async launch(plan: LaunchPlan, context: { launchId: string }): Promise<LaunchReport> {
    launches.push(plan);
    if (launchFailure) throw launchFailure;
    return {
      launchId: context.launchId,
      tracking: 'none',
      method: 'terminal',
      isolation: plan.isolation,
      terminal: 'Test terminal',
      pid: null,
      notes: [],
    };
  },
} as unknown as Launcher;

function system(options: { withClaude?: boolean } = {}) {
  const runner = fakeRunner((call) => {
    if (call.args.includes('--version')) return { exitCode: 0, stdout: '2.1.0 (Claude Code)' };
    if (call.args.includes('status')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ loggedIn: false, configDirectory: call.env.CLAUDE_CONFIG_DIR }),
      };
    }
    return { exitCode: 0 };
  });
  return realFsSystem(home, {
    env: {
      PATH: options.withClaude === false ? path.join(root, 'empty') : bin,
      HOME: home,
      ANTHROPIC_API_KEY: SECRET,
    },
    runner,
  });
}

async function service(options: { withClaude?: boolean } = {}) {
  const sys = system(options);
  const svc = new ProfileService({
    store: new MetadataStore({ filePath: paths.metadataFile, logger: nullLogger }),
    registry: createDefaultRegistry(),
    system: sys,
    paths,
    launcher: fakeLauncher,
    tracker: new ProcessTracker(sys, paths.runtimeDir, nullLogger),
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
  return { svc, sys };
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

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ appError: { code } });
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ps-service-'));
  home = path.join(root, 'home');
  bin = path.join(root, 'bin');
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const claude = path.join(bin, isWindows ? 'claude.exe' : 'claude');
  writeFileSync(claude, '#!/bin/sh\n', { mode: 0o755 });
  paths = resolveAppPaths({
    platform: process.platform,
    homeDir: home,
    env: { PROFILE_SWITCHER_DATA_DIR: path.join(root, 'data') },
  });
  launches = [];
  launchFailure = null;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('profile creation', () => {
  it('creates distinct, owner-only managed directories and persists metadata', async () => {
    const { svc } = await service();
    const personal = await svc.create(input({ name: 'Personal' }));
    const work = await svc.create(input({ name: 'Work' }));
    const snapshot = await svc.snapshot();

    const dirs = snapshot.profiles.map((p) => p.dataDirectory!);
    expect(new Set(dirs).size).toBe(2);
    expect(dirs).toEqual([
      path.join(paths.profilesRoot, 'claude-code', personal),
      path.join(paths.profilesRoot, 'claude-code', work),
    ]);
    for (const dir of dirs) {
      expect(statSync(dir).isDirectory()).toBe(true);
      if (!isWindows) expect(statSync(dir).mode & 0o777).toBe(0o700);
    }
    expect(snapshot.profiles.every((p) => p.compatibility.state === 'Supported')).toBe(true);

    const { svc: reloaded } = await service();
    expect((await reloaded.snapshot()).profiles.map((p) => p.name)).toEqual(['Personal', 'Work']);
  });

  it('enforces unique names per application without creating directories', async () => {
    const { svc } = await service();
    await svc.create(input({ name: 'Work' }));
    await expectCode(svc.create(input({ name: '  WORK ' })), 'DUPLICATE_PROFILE_NAME');
    expect((await svc.snapshot()).profiles).toHaveLength(1);
  });

  it('allows only one application-default profile per application', async () => {
    const { svc } = await service();
    await svc.create(input({ name: 'Default', storage: { kind: 'app-default' } }));
    await expectCode(
      svc.create(input({ name: 'Again', storage: { kind: 'app-default' } })),
      'APP_DEFAULT_ALREADY_USED',
    );
  });

  it('rejects Claude Desktop isolated storage, and Claude Desktop entirely on Linux', async () => {
    const { svc } = await service();
    const desktop = input({ name: 'Desk', appId: 'claude-desktop' });
    await expectCode(
      svc.create(desktop),
      process.platform === 'linux' ? 'APP_UNSUPPORTED_PLATFORM' : 'STORAGE_KIND_NOT_SUPPORTED',
    );
    await expectCode(svc.create(input({ appId: 'unknown-app' })), 'UNKNOWN_APPLICATION');
  });
});

describe('custom directories', () => {
  const custom = (p: string, allowNonEmpty = false) =>
    input({ name: `C ${Math.random()}`, storage: { kind: 'custom', path: p, allowNonEmpty } });

  it('creates a missing folder and accepts an empty one', async () => {
    const { svc } = await service();
    const target = path.join(root, 'profiles-elsewhere', 'work');
    await svc.create(custom(target));
    expect(existsSync(target)).toBe(true);
    const empty = path.join(root, 'empty-dir');
    mkdirSync(empty);
    await svc.create(custom(empty));
  });

  it('requires explicit approval for a non-empty folder and never touches its files', async () => {
    const { svc } = await service();
    const existing = path.join(root, 'existing');
    mkdirSync(existing);
    writeFileSync(path.join(existing, 'keep.txt'), 'original');
    await expectCode(svc.create(custom(existing)), 'DIRECTORY_NOT_EMPTY');
    await svc.create(custom(existing, true));
    expect(readFileSync(path.join(existing, 'keep.txt'), 'utf8')).toBe('original');
  });

  it('rejects reserved and unsafe locations', async () => {
    const { svc } = await service();
    const file = path.join(root, 'a-file');
    writeFileSync(file, 'x');
    await expectCode(svc.create(custom(home)), 'DIRECTORY_RESERVED');
    await expectCode(svc.create(custom(root)), 'DIRECTORY_RESERVED');
    await expectCode(svc.create(custom(path.join(home, '.claude'))), 'DIRECTORY_RESERVED');
    await expectCode(svc.create(custom(path.join(home, '.claude', 'sub'))), 'DIRECTORY_RESERVED');
    await expectCode(
      svc.create(custom(path.join(paths.profilesRoot, 'mine'))),
      'DIRECTORY_RESERVED',
    );
    await expectCode(svc.create(custom(paths.metadataDir)), 'DIRECTORY_RESERVED');
    await expectCode(svc.create(custom(path.parse(root).root)), 'DIRECTORY_RESERVED');
    await expectCode(svc.create(custom('relative/dir')), 'DIRECTORY_NOT_ABSOLUTE');
    await expectCode(
      svc.create(custom(`${root}${path.sep}..${path.sep}escape`)),
      'DIRECTORY_NOT_ABSOLUTE',
    );
    await expectCode(svc.create(custom(file)), 'DIRECTORY_IS_FILE');
  });

  it('rejects folders that overlap another profile', async () => {
    const { svc } = await service();
    const shared = path.join(root, 'shared');
    await svc.create(custom(shared));
    await expectCode(svc.create(custom(shared)), 'DIRECTORY_OVERLAPS_PROFILE');
    await expectCode(svc.create(custom(path.join(shared, 'nested'))), 'DIRECTORY_OVERLAPS_PROFILE');
  });

  it.skipIf(isWindows)(
    'resolves symlinks so a link cannot point at a reserved folder',
    async () => {
      const { svc } = await service();
      mkdirSync(path.join(home, '.claude'));
      const link = path.join(root, 'innocent-looking');
      symlinkSync(path.join(home, '.claude'), link);
      await expectCode(svc.create(custom(link)), 'DIRECTORY_RESERVED');
      const linkParent = path.join(root, 'link-parent');
      symlinkSync(home, linkParent);
      await expectCode(
        svc.create(custom(path.join(linkParent, '.claude', 'new'))),
        'DIRECTORY_RESERVED',
      );
    },
  );
});

describe('editing and deleting', () => {
  it('renames, validates working directories, and keeps storage fixed', async () => {
    const { svc } = await service();
    const id = await svc.create(input({ name: 'Work' }));
    await svc.create(input({ name: 'Personal' }));
    await svc.update({ id, name: 'Client A', description: 'Acme account' });
    await expectCode(svc.update({ id, name: 'personal' }), 'DUPLICATE_PROFILE_NAME');
    await expectCode(
      svc.update({ id, launch: { workingDirectory: path.join(root, 'missing') } }),
      'WORKING_DIRECTORY_INVALID',
    );
    await svc.update({ id, launch: { workingDirectory: home } });
    const profile = (await svc.snapshot()).profiles.find((p) => p.id === id)!;
    expect(profile).toMatchObject({
      name: 'Client A',
      description: 'Acme account',
      launch: { workingDirectory: home },
      storage: { kind: 'managed' },
    });
    await expectCode(svc.update({ id: 'missing-123' }), 'PROFILE_NOT_FOUND');
  });

  it('deletes metadata only and keeps the configuration folder and its contents', async () => {
    const { svc } = await service();
    const id = await svc.create(input());
    const dir = (await svc.snapshot()).profiles[0]!.dataDirectory!;
    writeFileSync(
      path.join(dir, '.credentials.json'),
      '{"simulated":"sign-in owned by Claude Code"}',
    );
    await svc.launch(id);

    const retained = await svc.delete(id);
    expect(retained).toBe(dir);
    expect(existsSync(path.join(dir, '.credentials.json'))).toBe(true);
    const snapshot = await svc.snapshot();
    expect(snapshot.profiles).toEqual([]);
    expect(snapshot.lastLaunchedProfileId).toBeNull();
    await expectCode(svc.delete(id), 'PROFILE_NOT_FOUND');
  });
});

describe('launching and verification', () => {
  it('launches with the profile directory and records the outcome', async () => {
    const { svc } = await service();
    const id = await svc.create(input());
    const report = await svc.launch(id);
    expect(report.terminal).toBe('Test terminal');
    const plan = launches[0]!;
    expect(plan.type).toBe('cli');
    if (plan.type === 'cli') {
      expect(plan.env.set.CLAUDE_CONFIG_DIR).toBe(path.join(paths.profilesRoot, 'claude-code', id));
      expect(plan.env.unset).toContain('ANTHROPIC_API_KEY');
    }
    const snapshot = await svc.snapshot();
    expect(snapshot.lastLaunchedProfileId).toBe(id);
    expect(snapshot.profiles[0]!.lastLaunch).toMatchObject({
      outcome: 'started',
      method: 'terminal',
      isolation: 'isolated',
    });
  });

  it('records failures without claiming success', async () => {
    const { svc } = await service();
    const id = await svc.create(input());
    launchFailure = new AppFailure('TERMINAL_NOT_FOUND');
    await expectCode(svc.launch(id), 'TERMINAL_NOT_FOUND');
    const snapshot = await svc.snapshot();
    expect(snapshot.profiles[0]!.lastLaunch).toMatchObject({
      outcome: 'failed',
      errorCode: 'TERMINAL_NOT_FOUND',
    });
    expect(snapshot.lastLaunchedProfileId).toBeNull();
  });

  it('refuses to launch when the application is missing', async () => {
    const { svc } = await service({ withClaude: false });
    const id = await svc.create(input());
    expect((await svc.snapshot()).profiles[0]!.compatibility.state).toBe('ApplicationNotFound');
    await expectCode(svc.launch(id), 'LAUNCH_NOT_AVAILABLE');
    expect(launches).toHaveLength(0);
  });

  it('recreates a removed managed directory empty at launch', async () => {
    const { svc } = await service();
    const id = await svc.create(input());
    const dir = path.join(paths.profilesRoot, 'claude-code', id);
    rmSync(dir, { recursive: true });
    await svc.launch(id);
    expect(existsSync(dir)).toBe(true);
  });

  it('verifies isolation through the application and copies a launch command', async () => {
    const { svc } = await service();
    const id = await svc.create(input());
    const report = await svc.verify(id);
    expect(report.configDirectoryMatches).toBe(true);
    expect(report.strippedVariables).toEqual(['ANTHROPIC_API_KEY']);
    const shell = isWindows ? 'powershell' : 'posix';
    expect(await svc.copyCommand(id, shell)).toContain(
      path.join(paths.profilesRoot, 'claude-code', id),
    );
    await expectCode(svc.copyCommand(id, isWindows ? 'posix' : 'cmd'), 'VALIDATION_FAILED');
  });
});

describe('credential hygiene', () => {
  it('never writes environment secrets to metadata, snapshots, or diagnostics', async () => {
    const { svc, sys } = await service();
    const id = await svc.create(input({ description: 'Sign in as work account' }));
    await svc.launch(id);
    await svc.verify(id);
    const snapshot = await svc.snapshot();
    expect(snapshot.environment.credentialOverrideVariables).toEqual(['ANTHROPIC_API_KEY']);

    const desktop: DesktopIntegration = {
      chooseDirectory: vi.fn(async () => null),
      openPath: vi.fn(async () => ''),
      openExternal: vi.fn(async () => undefined),
      writeClipboard: vi.fn(),
      applyTheme: vi.fn(),
    };
    const handlers = createIpcHandlers({
      service: svc,
      desktop,
      system: sys,
      paths,
      redactor: createRedactor(home),
      logger: nullLogger,
    });
    const diagnostics = (await handlers['diagnostics:get']()) as DiagnosticsReport;

    for (const text of [
      readFileSync(paths.metadataFile, 'utf8'),
      JSON.stringify(snapshot),
      diagnostics.text,
    ]) {
      expect(text).not.toContain(SECRET);
    }
    expect(diagnostics.text).not.toContain('Sign in as work account');
  });

  it('opens only the resolved profile folder, never a renderer-supplied path', async () => {
    const { svc, sys } = await service();
    const id = await svc.create(input());
    const openPath = vi.fn(async () => '');
    const handlers = createIpcHandlers({
      service: svc,
      desktop: {
        chooseDirectory: vi.fn(),
        openPath,
        openExternal: vi.fn(),
        writeClipboard: vi.fn(),
        applyTheme: vi.fn(),
      },
      system: sys,
      paths,
      redactor: createRedactor(home),
      logger: nullLogger,
    });
    await handlers['profiles:open-directory'](id);
    expect(openPath).toHaveBeenCalledWith(path.join(paths.profilesRoot, 'claude-code', id));
  });
});
