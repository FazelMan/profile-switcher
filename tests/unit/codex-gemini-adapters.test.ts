import { describe, expect, it } from 'vitest';
import { createCodexCliAdapter, parseCodexLoginStatus } from '../../src/main/adapters/codex-cli';
import { createGeminiCliAdapter } from '../../src/main/adapters/gemini-cli';
import type { ProfileFsState } from '../../src/main/adapters/types';
import type { DetectionResult } from '../../src/shared/domain/compatibility';
import type { Profile } from '../../src/shared/domain/profile';
import { fakeFiles, fakeRunner, fakeSystem } from '../helpers/fake-system';

const NO_EXPERIMENTS = { claudeDesktopIsolation: false };
const okFs: ProfileFsState = {
  dataDirectory: 'ok',
  dataDirectoryRecreatable: true,
  workingDirectory: 'not-set',
};

const cases = [
  {
    adapter: createCodexCliAdapter(),
    exe: '/usr/local/bin/codex',
    variable: 'CODEX_HOME',
    credential: 'OPENAI_API_KEY',
    versionOutput: 'codex-cli 0.162.1',
    version: '0.162.1',
    reserved: '/home/tester/.codex',
  },
  {
    adapter: createGeminiCliAdapter(),
    exe: '/usr/local/bin/gemini',
    variable: 'GEMINI_CLI_HOME',
    credential: 'GEMINI_API_KEY',
    versionOutput: '0.63.0',
    version: '0.63.0',
    reserved: '/home/tester/.gemini',
  },
] as const;

function profile(appId: string, overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'work-abc234',
    appId,
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

const DIR = '/data/profiles/x/work-abc234';

describe.each(cases)('$adapter.displayName adapter', (c) => {
  const found: DetectionResult = {
    status: 'found',
    executablePath: c.exe,
    version: c.version,
    source: 'path',
    checkedAt: '',
  };

  it('declares a documented isolation mechanism and its reserved default folder', () => {
    expect(c.adapter.isolationDocumented).toBe(true);
    expect(c.adapter.storageKinds).toEqual(['managed', 'custom', 'app-default']);
    expect(c.adapter.reservedDirectories(fakeSystem())).toEqual([c.reserved]);
    expect(c.adapter.credentialVariables).toContain(c.credential);
  });

  it('reads the version with its folder pointed at a scratch folder, never the default', async () => {
    const runner = fakeRunner(() => ({ exitCode: 0, stdout: c.versionOutput }));
    const system = fakeSystem({
      env: { PATH: '/usr/local/bin', HOME: '/home/tester', [c.credential]: 'secret' },
      files: fakeFiles({ [c.exe]: 'exec' }),
      runner,
    });
    const detection = await c.adapter.detect(system, { scratchDir: '/run/probe/x' });
    expect(detection).toMatchObject({ status: 'found', executablePath: c.exe, version: c.version });
    expect(runner.calls[0]?.args).toEqual(['--version']);
    expect(runner.calls[0]?.env[c.variable]).toBe('/run/probe/x');
    expect(runner.calls[0]?.env[c.credential]).toBeUndefined();

    const noScratch = fakeRunner();
    const without = await c.adapter.detect({ ...system, runner: noScratch });
    expect(without.version).toBeNull();
    expect(noScratch.calls).toEqual([]);
  });

  it('launches with the profile folder in the documented variable and no credential override', () => {
    const plan = c.adapter.buildLaunchPlan({
      profile: profile(c.adapter.id),
      dataDirectory: DIR,
      detection: found,
      system: fakeSystem(),
      experimental: NO_EXPERIMENTS,
    });
    expect(plan).toMatchObject({ type: 'cli', executable: c.exe, isolation: 'isolated' });
    expect(plan.env.set).toEqual({ [c.variable]: DIR });
    expect(plan.env.unset).toContain(c.credential);

    const shared = c.adapter.buildLaunchPlan({
      profile: profile(c.adapter.id, { storage: { kind: 'app-default' } }),
      dataDirectory: null,
      detection: found,
      system: fakeSystem(),
      experimental: NO_EXPERIMENTS,
    });
    expect(shared.env.set).toEqual({});
    expect(shared.env.unset).toContain(c.variable);
    expect(shared.isolation).toBe('shared');
  });

  it('reports Supported only when nothing can override the profile’s sign-in', () => {
    const evaluate = (p: Profile, env: Record<string, string> = {}, detection = found) =>
      c.adapter.evaluate({
        profile: p,
        dataDirectory: DIR,
        fsState: okFs,
        detection,
        system: fakeSystem({ env: { PATH: '/usr/bin', ...env } }),
        experimental: NO_EXPERIMENTS,
      });
    const ok = evaluate(profile(c.adapter.id));
    expect(ok.state).toBe('Supported');
    expect(ok.summary).toEqual({
      code: 'compat.cli.isolated.summary',
      params: { app: c.adapter.displayName, variable: c.variable, version: c.version },
    });

    const inherited = evaluate(
      profile(c.adapter.id, { launch: { workingDirectory: null, inheritCredentialEnv: true } }),
      { [c.credential]: 'x' },
    );
    expect(inherited.state).toBe('NeedsVerification');

    expect(evaluate(profile(c.adapter.id), {}, { ...found, version: null }).state).toBe(
      'NeedsVerification',
    );
    expect(
      evaluate(profile(c.adapter.id), {}, { ...found, status: 'not-found', executablePath: null })
        .state,
    ).toBe('ApplicationNotFound');
    expect(evaluate(profile(c.adapter.id, { storage: { kind: 'app-default' } })).launch).toEqual({
      available: true,
      isolation: 'shared',
    });
  });
});

describe('Gemini CLI specifics', () => {
  const adapter = createGeminiCliAdapter();
  const evaluate = (env: Record<string, string>) =>
    adapter.evaluate({
      profile: profile('gemini-cli'),
      dataDirectory: DIR,
      fsState: okFs,
      detection: {
        status: 'found',
        executablePath: '/usr/bin/gemini',
        version: '0.63.0',
        source: 'path',
        checkedAt: '',
      },
      system: fakeSystem({ env: { PATH: '/usr/bin', ...env } }),
      experimental: NO_EXPERIMENTS,
    });

  it('needs verification while sign-ins go to the shared keychain entry or a cloud provider', () => {
    expect(evaluate({ GEMINI_FORCE_ENCRYPTED_FILE_STORAGE: 'true' }).state).toBe(
      'NeedsVerification',
    );
    expect(evaluate({ GOOGLE_GENAI_USE_VERTEXAI: 'true' }).state).toBe('NeedsVerification');
    expect(evaluate({ GOOGLE_APPLICATION_CREDENTIALS: '/k.json' }).state).toBe('NeedsVerification');
    expect(evaluate({ GEMINI_FORCE_ENCRYPTED_FILE_STORAGE: 'false' }).state).toBe('Supported');
  });

  it('offers no Verify, because Gemini CLI cannot report its sign-in', () => {
    expect(adapter.supportsVerification).toBe(false);
    expect(evaluate({}).limitations.map((m) => m.code)).toContain(
      'compat.geminiCli.limitation.noStatus',
    );
  });
});

describe('Codex CLI verification', () => {
  const adapter = createCodexCliAdapter();
  const input = (stderr: string, exitCode: number) => ({
    profile: profile('codex-cli'),
    dataDirectory: DIR,
    detection: {
      status: 'found' as const,
      executablePath: '/usr/bin/codex',
      version: '0.162.1',
      source: 'path' as const,
      checkedAt: '',
    },
    system: fakeSystem({
      env: { PATH: '/usr/bin', OPENAI_API_KEY: 'sk-secret' },
      runner: fakeRunner(() => ({ exitCode, stderr })),
    }),
    experimental: NO_EXPERIMENTS,
  });

  it('runs codex login status with the profile folder and reports what Codex says', async () => {
    const i = input('Logged in using ChatGPT\n', 0);
    const report = await adapter.verify(i);
    const call = (i.system.runner as ReturnType<typeof fakeRunner>).calls[0]!;
    expect(call.args).toEqual(['login', 'status']);
    expect(call.env.CODEX_HOME).toBe(DIR);
    expect(call.env.OPENAI_API_KEY).toBeUndefined();
    expect(report).toMatchObject({
      loggedIn: true,
      authMethod: 'ChatGPT',
      expectedConfigDirectory: DIR,
      reportedConfigDirectory: null,
      configDirectoryMatches: null,
      strippedVariables: ['OPENAI_API_KEY'],
    });
    expect(JSON.stringify(report)).not.toContain('sk-secret');
  });

  it('parses signed-out, API-key, and missing-folder outputs', async () => {
    expect((await adapter.verify(input('Not logged in\n', 1))).loggedIn).toBe(false);
    expect(
      parseCodexLoginStatus({
        exitCode: 0,
        stdout: '',
        stderr: 'Logged in using an API key - sk-ab***',
        timedOut: false,
      }),
    ).toEqual({ loggedIn: true, authMethod: 'API key' });
    await expect(
      adapter.verify(
        input(
          'Error loading configuration: CODEX_HOME points to "/x", but that path does not exist',
          1,
        ),
      ),
    ).rejects.toMatchObject({ appError: { code: 'VERIFICATION_FAILED' } });
  });
});
