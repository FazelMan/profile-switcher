import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClaudeCodeAdapter } from '../../src/main/adapters/claude-code';
import { Launcher } from '../../src/main/launch/launcher';
import { createNodeSystemContext } from '../../src/main/system';
import type { Profile } from '../../src/shared/domain/profile';
import { nullLogger } from '../helpers/fake-system';

const NO_EXPERIMENTS = { claudeDesktopIsolation: false };

/**
 * Spawns real processes (no mocks) through the production Launcher on Linux,
 * using the stand-in terminal and Claude Code executables from the e2e
 * fixtures. Proves what the launched process actually receives.
 */
const fixturesBin = path.resolve(__dirname, '../e2e/fixtures/bin');

describe.runIf(process.platform === 'linux')('real process launch (Linux)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ps-real-launch-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('delivers CLAUDE_CONFIG_DIR and strips credentials in the launched process', async () => {
    const recordFile = path.join(dir, 'record.jsonl');
    const configDir = path.join(dir, "profile dir with 'quotes' and spaces");
    const base = createNodeSystemContext();
    const system = {
      ...base,
      homeDir: dir,
      env: {
        PATH: `${fixturesBin}:/usr/bin:/bin`,
        HOME: dir,
        PS_E2E_RECORD_FILE: recordFile,
        ANTHROPIC_API_KEY: 'sk-ant-must-not-arrive',
        CLAUDE_CODE_OAUTH_TOKEN: 'must-not-arrive-either',
      },
    };
    const adapter = new ClaudeCodeAdapter();
    const detection = await adapter.detect(system);
    expect(detection).toMatchObject({
      status: 'found',
      executablePath: path.join(fixturesBin, 'claude'),
      version: '2.1.0',
    });

    const profile: Profile = {
      id: 'work-abc234',
      appId: 'claude-code',
      name: 'Work',
      description: '',
      color: 'blue',
      storage: { kind: 'custom', path: configDir },
      launch: { workingDirectory: null, inheritCredentialEnv: false },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastLaunch: null,
      manualCheck: null,
    };
    const plan = adapter.buildLaunchPlan({
      profile,
      dataDirectory: configDir,
      detection,
      system,
      experimental: NO_EXPERIMENTS,
    });
    const report = await new Launcher(system, path.join(dir, 'launchers'), nullLogger).launch(
      plan,
      {
        profileId: profile.id,
        launchId: 'abcdef123456',
        preferredTerminal: 'x-terminal-emulator',
        pidFile: null,
      },
    );
    expect(report.tracking).toBe('none');

    const deadline = Date.now() + 10_000;
    while (!existsSync(recordFile) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50));
    const record = JSON.parse(readFileSync(recordFile, 'utf8').trim()) as {
      configDir: string;
      apiKeyPresent: boolean;
      cwd: string;
    };
    expect(record).toMatchObject({ configDir, apiKeyPresent: false, cwd: dir });

    const verification = await adapter.verify({
      profile,
      dataDirectory: configDir,
      detection,
      system,
      experimental: NO_EXPERIMENTS,
    });
    expect(verification.configDirectoryMatches).toBe(true);
    expect(verification.strippedVariables).toEqual([
      'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN',
    ]);
  });
});
