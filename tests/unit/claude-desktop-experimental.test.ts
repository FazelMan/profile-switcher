import { describe, expect, it } from 'vitest';
import { ClaudeDesktopAdapter, userDataDirArgument } from '../../src/main/adapters/claude-desktop';
import type { ProfileFsState } from '../../src/main/adapters/types';
import { isAppFailure } from '../../src/shared/domain/errors';
import type { DetectionResult } from '../../src/shared/domain/compatibility';
import type { Profile } from '../../src/shared/domain/profile';
import { fakeFiles, fakeSystem } from '../helpers/fake-system';

const adapter = new ClaudeDesktopAdapter();
const DIR =
  '/Users/ana/Library/Application Support/Profile Switcher/profiles/claude-desktop/work-k3m9tq';
const ON = { claudeDesktopIsolation: true };
const OFF = { claudeDesktopIsolation: false };
const okFs: ProfileFsState = {
  dataDirectory: 'ok',
  dataDirectoryRecreatable: true,
  workingDirectory: 'not-set',
};
const found: DetectionResult = {
  status: 'found',
  executablePath: '/Applications/Claude.app',
  version: '0.14.10',
  source: 'known-location',
  checkedAt: '2026-01-01T00:00:00.000Z',
};

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'work-k3m9tq',
    appId: 'claude-desktop',
    name: 'Work',
    description: '',
    color: 'violet',
    storage: { kind: 'managed' },
    launch: { workingDirectory: null, inheritCredentialEnv: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLaunch: null,
    manualCheck: null,
    ...overrides,
  };
}

function evaluate(options: {
  profile?: Profile;
  experimental?: { claudeDesktopIsolation: boolean };
  detection?: DetectionResult;
  fsState?: ProfileFsState;
}) {
  return adapter.evaluate({
    profile: options.profile ?? profile(),
    dataDirectory: DIR,
    fsState: options.fsState ?? okFs,
    detection: options.detection ?? found,
    system: fakeSystem({ platform: 'darwin', homeDir: '/Users/ana' }),
    experimental: options.experimental ?? ON,
  });
}

describe('experimental Claude Desktop profiles', () => {
  it('are declared as an opt-in experimental mechanism, not as documented isolation', () => {
    expect(adapter.isolationDocumented).toBe(false);
    expect(adapter.storageKinds).toEqual(['app-default']);
    expect(adapter.experimental).toMatchObject({
      feature: 'claudeDesktopIsolation',
      storageKinds: ['managed', 'custom'],
    });
  });

  it('cannot launch while the feature is off, and never falls back to a shared launch', () => {
    const report = evaluate({ experimental: OFF });
    expect(report.state).toBe('Unsupported');
    expect(report.launch).toEqual({ available: false, isolation: 'experimental' });
    expect(report.summary.code).toBe('compat.claudeDesktop.experimental.disabled.summary');
    try {
      adapter.buildLaunchPlan({
        profile: profile(),
        dataDirectory: DIR,
        detection: found,
        system: fakeSystem({ platform: 'darwin' }),
        experimental: OFF,
      });
      expect.unreachable();
    } catch (error) {
      expect(isAppFailure(error) && error.appError.code).toBe('LAUNCH_NOT_AVAILABLE');
    }
  });

  it('needs verification when on, and lists every known risk', () => {
    const report = evaluate({});
    expect(report.state).toBe('NeedsVerification');
    expect(report.launch).toEqual({ available: true, isolation: 'experimental' });
    expect(report.limitations.map((m) => m.code)).toEqual([
      'compat.claudeDesktop.experimental.limitation.undocumented',
      'compat.claudeDesktop.experimental.limitation.signInCallback',
      'compat.claudeDesktop.experimental.limitation.notVerifiable',
      'compat.claudeDesktop.experimental.limitation.sharedSystem',
    ]);
    expect(report.guarantees.map((m) => m.code)).not.toContain(
      'compat.claudeCode.isolated.guarantee.credentials',
    );
  });

  it('counts the user’s own check only for the Claude Desktop version it was made with', () => {
    const checked = profile({
      manualCheck: { at: '2026-02-01T00:00:00.000Z', appVersion: '0.14.10' },
    });
    const same = evaluate({ profile: checked });
    expect(same.state).toBe('Supported');
    expect(same.launch.isolation).toBe('experimental');
    expect(same.summary.code).toBe('compat.claudeDesktop.experimental.checkedSummary');

    const updated = evaluate({ profile: checked, detection: { ...found, version: '0.15.0' } });
    expect(updated.state).toBe('NeedsVerification');
    expect(updated.summary.code).toBe('compat.claudeDesktop.experimental.versionChanged');
  });

  it('reports a missing custom folder as a configuration error', () => {
    const report = evaluate({
      profile: profile({ storage: { kind: 'custom', path: DIR } }),
      fsState: { ...okFs, dataDirectory: 'missing', dataDirectoryRecreatable: false },
    });
    expect(report.state).toBe('ConfigurationError');
    expect(report.launch.available).toBe(false);
  });

  it('passes the profile folder as the final --user-data-dir argument and nothing else', () => {
    const plan = adapter.buildLaunchPlan({
      profile: profile(),
      dataDirectory: DIR,
      detection: found,
      system: fakeSystem({ platform: 'darwin' }),
      experimental: ON,
    });
    expect(plan).toEqual({
      type: 'desktop',
      target: '/Applications/Claude.app',
      args: [`--user-data-dir=${DIR}`],
      marker: `--user-data-dir=${DIR}`,
      isolation: 'experimental',
    });
    expect(userDataDirArgument('C:\\P\\w')).toBe('--user-data-dir=C:\\P\\w');
  });

  it('keeps the default Claude Desktop profile an ordinary launch even when the feature is on', () => {
    const shared = profile({ storage: { kind: 'app-default' } });
    expect(evaluate({ profile: shared }).launch).toEqual({ available: true, isolation: 'shared' });
    const plan = adapter.buildLaunchPlan({
      profile: shared,
      dataDirectory: null,
      detection: found,
      system: fakeSystem({ platform: 'darwin' }),
      experimental: ON,
    });
    expect(plan).toMatchObject({ args: [], marker: null, isolation: 'shared' });
  });

  it('reads the installed version on Windows from the newest app-<version> folder', async () => {
    const root = 'C:\\Users\\ana\\AppData\\Local\\AnthropicClaude';
    const system = fakeSystem({
      platform: 'win32',
      homeDir: 'C:\\Users\\ana',
      env: { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' },
      files: fakeFiles({
        [root]: 'dir',
        [`${root}\\claude.exe`]: 'file',
        [`${root}\\app-0.9.3`]: 'dir',
        [`${root}\\app-0.14.10`]: 'dir',
        [`${root}\\app-0.14.2`]: 'dir',
        [`${root}\\packages`]: 'dir',
      }),
    });
    expect(await adapter.detect(system)).toMatchObject({
      status: 'found',
      executablePath: `${root}\\claude.exe`,
      version: '0.14.10',
    });
  });
});
