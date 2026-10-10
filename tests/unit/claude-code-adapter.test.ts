import { describe, expect, it } from 'vitest';
import type { DetectionResult } from '../../src/shared/domain/compatibility';
import type { Profile } from '../../src/shared/domain/profile';
import { ClaudeCodeAdapter } from '../../src/main/adapters/claude-code';
import type { ProfileFsState } from '../../src/main/adapters/types';
import { isAppFailure } from '../../src/shared/domain/errors';
import { fakeFiles, fakeRunner, fakeSystem } from '../helpers/fake-system';

const NO_EXPERIMENTS = { claudeDesktopIsolation: false };

const adapter = new ClaudeCodeAdapter();

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'work-abc234',
    appId: 'claude-code',
    name: 'Work',
    description: '',
    color: 'blue',
    storage: { kind: 'managed' },
    launch: { workingDirectory: null, inheritCredentialEnv: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLaunch: null,
    manualCheck: null,
    ...overrides,
  };
}

const found: DetectionResult = {
  status: 'found',
  executablePath: '/home/tester/.local/bin/claude',
  version: '2.1.296',
  source: 'known-location',
  checkedAt: '2026-01-01T00:00:00.000Z',
};
const okFs: ProfileFsState = {
  dataDirectory: 'ok',
  dataDirectoryRecreatable: true,
  workingDirectory: 'not-set',
};
const dataDirectory = '/data/profiles/claude-code/work-abc234';

function evaluate(
  options: {
    profile?: Profile;
    detection?: DetectionResult;
    fsState?: ProfileFsState;
    env?: Record<string, string>;
  } = {},
) {
  return adapter.evaluate({
    profile: options.profile ?? profile(),
    dataDirectory:
      (options.profile ?? profile()).storage.kind === 'app-default' ? null : dataDirectory,
    fsState: options.fsState ?? okFs,
    detection: options.detection ?? found,
    system: fakeSystem({ env: { PATH: '/usr/bin', ...options.env } }),
    experimental: NO_EXPERIMENTS,
  });
}

describe('ClaudeCodeAdapter.detect', () => {
  it('finds the native install and reads its version without credentials in the environment', async () => {
    const runner = fakeRunner(() => ({ exitCode: 0, stdout: '2.1.296 (Claude Code)\n' }));
    const system = fakeSystem({
      env: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant-secret' },
      files: fakeFiles({ '/home/tester/.local/bin/claude': 'exec' }),
      runner,
    });
    const result = await adapter.detect(system);
    expect(result).toMatchObject({
      status: 'found',
      executablePath: '/home/tester/.local/bin/claude',
      version: '2.1.296',
    });
    expect(runner.calls[0]?.args).toEqual(['--version']);
    expect(runner.calls[0]?.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('reports not-found without running anything', async () => {
    const runner = fakeRunner();
    const result = await adapter.detect(fakeSystem({ runner }));
    expect(result.status).toBe('not-found');
    expect(runner.calls).toHaveLength(0);
  });

  it('keeps detection but leaves the version unknown when --version fails', async () => {
    const system = fakeSystem({
      files: fakeFiles({ '/usr/bin/claude': 'exec' }),
      runner: fakeRunner(() => ({ exitCode: 1 })),
    });
    expect(await adapter.detect(system)).toMatchObject({ status: 'found', version: null });
  });

  it('wraps an npm .cmd shim through cmd.exe on Windows', async () => {
    const runner = fakeRunner(() => ({ exitCode: 0, stdout: '2.0.0' }));
    const system = fakeSystem({
      platform: 'win32',
      homeDir: 'C:\\Users\\ana',
      env: { Path: 'C:\\Users\\ana\\AppData\\Roaming\\npm', SystemRoot: 'C:\\Windows' },
      files: fakeFiles({ 'C:\\Users\\ana\\AppData\\Roaming\\npm\\claude.cmd': 'file' }),
      runner,
    });
    await adapter.detect(system);
    expect(runner.calls[0]).toMatchObject({
      file: 'C:\\Windows\\System32\\cmd.exe',
      windowsVerbatimArguments: true,
    });
  });
});

describe('ClaudeCodeAdapter.evaluate', () => {
  it('reports Supported isolation with explicit guarantees and limitations', () => {
    const report = evaluate();
    expect(report.state).toBe('Supported');
    expect(report.launch).toEqual({ available: true, isolation: 'isolated' });
    expect(report.summary).toEqual({
      code: 'compat.claudeCode.isolated.summary',
      params: { version: '2.1.296' },
    });
    expect(report.guarantees.map((m) => m.code)).toContain(
      'compat.claudeCode.isolated.guarantee.credentials',
    );
    expect(report.limitations.map((m) => m.code)).toEqual(
      expect.arrayContaining([
        'compat.claudeCode.limitation.consoleKeyless',
        'compat.claudeCode.limitation.entitlements',
      ]),
    );
  });

  it('reports ApplicationNotFound and disables launch', () => {
    const report = evaluate({
      detection: { ...found, status: 'not-found', executablePath: null, version: null },
    });
    expect(report.state).toBe('ApplicationNotFound');
    expect(report.launch.available).toBe(false);
  });

  it('reports ConfigurationError for a missing custom folder or working directory', () => {
    const custom = profile({ storage: { kind: 'custom', path: '/mnt/usb/work' } });
    expect(
      evaluate({
        profile: custom,
        fsState: { ...okFs, dataDirectory: 'missing', dataDirectoryRecreatable: false },
      }).state,
    ).toBe('ConfigurationError');
    expect(evaluate({ fsState: { ...okFs, workingDirectory: 'invalid' } }).state).toBe(
      'ConfigurationError',
    );
    expect(evaluate({ fsState: { ...okFs, dataDirectory: 'not-directory' } }).state).toBe(
      'ConfigurationError',
    );
  });

  it('treats a missing managed folder as recreatable rather than an error', () => {
    expect(
      evaluate({ fsState: { ...okFs, dataDirectory: 'missing', dataDirectoryRecreatable: true } })
        .state,
    ).toBe('Supported');
  });

  it('labels app-default profiles as shared, never isolated', () => {
    const report = evaluate({ profile: profile({ storage: { kind: 'app-default' } }) });
    expect(report.state).toBe('Supported');
    expect(report.launch.isolation).toBe('shared');
    expect(report.guarantees).toEqual([]);
  });

  it('needs verification when the profile passes credential overrides through', () => {
    const report = evaluate({
      profile: profile({ launch: { workingDirectory: null, inheritCredentialEnv: true } }),
      env: { ANTHROPIC_API_KEY: 'sk-ant-secret' },
    });
    expect(report.state).toBe('NeedsVerification');
    expect(report.summary.params).toEqual({ variables: 'ANTHROPIC_API_KEY' });
    expect(JSON.stringify(report)).not.toContain('sk-ant');
  });

  it('does not need verification when overrides exist but are stripped (the default)', () => {
    expect(evaluate({ env: { ANTHROPIC_API_KEY: 'sk-ant-secret' } }).state).toBe('Supported');
  });

  it('needs verification when a provider switch is active', () => {
    expect(evaluate({ env: { CLAUDE_CODE_USE_BEDROCK: '1' } }).state).toBe('NeedsVerification');
  });

  it('needs verification when the version is unknown', () => {
    expect(evaluate({ detection: { ...found, version: null } }).state).toBe('NeedsVerification');
  });
});

describe('ClaudeCodeAdapter.buildLaunchPlan', () => {
  const system = fakeSystem({ env: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'x' } });

  it('sets CLAUDE_CONFIG_DIR, strips credential overrides, and starts in the home folder by default', () => {
    const plan = adapter.buildLaunchPlan({
      profile: profile(),
      dataDirectory,
      detection: found,
      system,
      experimental: NO_EXPERIMENTS,
    });
    expect(plan).toEqual({
      type: 'cli',
      executable: '/home/tester/.local/bin/claude',
      args: [],
      env: {
        set: { CLAUDE_CONFIG_DIR: dataDirectory },
        unset: [
          'ANTHROPIC_API_KEY',
          'ANTHROPIC_AUTH_TOKEN',
          'CLAUDE_CODE_OAUTH_TOKEN',
          'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
          'CLAUDE_CODE_OAUTH_SCOPES',
          'ANTHROPIC_PROFILE',
        ],
        prependPath: ['/home/tester/.local/bin'],
      },
      cwd: '/home/tester',
      isolation: 'isolated',
    });
  });

  it('keeps credential variables only when the profile opts in, and honours the working directory', () => {
    const plan = adapter.buildLaunchPlan({
      profile: profile({ launch: { workingDirectory: '/src/app', inheritCredentialEnv: true } }),
      dataDirectory,
      detection: found,
      system,
      experimental: NO_EXPERIMENTS,
    });
    expect(plan.env.unset).toEqual([]);
    expect(plan.cwd).toBe('/src/app');
  });

  it('removes an inherited CLAUDE_CONFIG_DIR for app-default profiles', () => {
    const plan = adapter.buildLaunchPlan({
      profile: profile({ storage: { kind: 'app-default' } }),
      dataDirectory: null,
      detection: found,
      system,
      experimental: NO_EXPERIMENTS,
    });
    expect(plan.env.set).toEqual({});
    expect(plan.env.unset).toContain('CLAUDE_CONFIG_DIR');
    expect(plan.isolation).toBe('shared');
  });

  it('refuses to plan a launch when Claude Code is not installed', () => {
    try {
      adapter.buildLaunchPlan({
        profile: profile(),
        dataDirectory,
        detection: { ...found, status: 'not-found', executablePath: null },
        system,
        experimental: NO_EXPERIMENTS,
      });
      expect.unreachable();
    } catch (error) {
      expect(isAppFailure(error) && error.appError.code).toBe('APP_NOT_FOUND');
    }
  });
});

describe('ClaudeCodeAdapter.verify', () => {
  function verifyWith(
    stdout: string,
    extra: Partial<{ timedOut: boolean; exitCode: number }> = {},
  ) {
    const runner = fakeRunner(() => ({ stdout, ...extra }));
    const system = fakeSystem({
      env: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant-secret' },
      runner,
    });
    return {
      runner,
      promise: adapter.verify({
        profile: profile(),
        dataDirectory,
        detection: found,
        system,
        experimental: NO_EXPERIMENTS,
      }),
    };
  }

  it('confirms isolation when Claude Code reports the profile folder', async () => {
    const { runner, promise } = verifyWith(
      JSON.stringify({
        loggedIn: true,
        authMethod: 'claude.ai',
        configDirectory: `${dataDirectory}/`,
        email: 'ana@example.com',
        subscriptionType: 'max',
      }),
    );
    const report = await promise;
    expect(report.configDirectoryMatches).toBe(true);
    expect(report.loggedIn).toBe(true);
    expect(report.account).toEqual({
      email: 'ana@example.com',
      organization: null,
      subscription: 'max',
    });
    expect(report.strippedVariables).toEqual(['ANTHROPIC_API_KEY']);
    expect(runner.calls[0]?.args).toEqual(['auth', 'status', '--json']);
    expect(runner.calls[0]?.env.CLAUDE_CONFIG_DIR).toBe(dataDirectory);
    expect(runner.calls[0]?.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('reports a mismatch instead of claiming isolation', async () => {
    const report = await verifyWith(
      JSON.stringify({ loggedIn: false, configDirectory: '/home/tester/.claude' }),
    ).promise;
    expect(report.configDirectoryMatches).toBe(false);
    expect(report.reportedConfigDirectory).toBe('/home/tester/.claude');
  });

  it('fails clearly on unreadable output or timeouts', async () => {
    await expect(verifyWith('not json').promise).rejects.toMatchObject({
      appError: { code: 'VERIFICATION_FAILED' },
    });
    await expect(verifyWith('', { timedOut: true }).promise).rejects.toMatchObject({
      appError: { code: 'VERIFICATION_FAILED', params: { reason: 'timeout' } },
    });
    await expect(verifyWith('[1,2]').promise).rejects.toMatchObject({
      appError: { code: 'VERIFICATION_FAILED' },
    });
  });
});
