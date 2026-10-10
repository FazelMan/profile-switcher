import { describe, expect, it } from 'vitest';
import type { Profile } from '../../src/shared/domain/profile';
import { ClaudeDesktopAdapter } from '../../src/main/adapters/claude-desktop';
import { createDefaultRegistry } from '../../src/main/adapters/registry';
import { fakeFiles, fakeSystem } from '../helpers/fake-system';

const NO_EXPERIMENTS = { claudeDesktopIsolation: false };

const adapter = new ClaudeDesktopAdapter();

const profile: Profile = {
  id: 'desk-abc234',
  appId: 'claude-desktop',
  name: 'Desktop',
  description: '',
  color: 'teal',
  storage: { kind: 'app-default' },
  launch: { workingDirectory: null, inheritCredentialEnv: false },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLaunch: null,
  manualCheck: null,
};

describe('ClaudeDesktopAdapter', () => {
  it('never offers isolated storage or verification', () => {
    expect(adapter.storageKinds).toEqual(['app-default']);
    expect(adapter.isolationDocumented).toBe(false);
    expect(adapter.supportsVerification).toBe(false);
    expect(adapter.supportsCopyCommand).toBe(false);
  });

  it('is unsupported on Linux, where no official build exists', async () => {
    const system = fakeSystem({ platform: 'linux' });
    const detection = await adapter.detect(system);
    expect(detection.status).toBe('unsupported-platform');
    const report = adapter.evaluate({
      profile,
      dataDirectory: null,
      fsState: {
        dataDirectory: 'not-applicable',
        dataDirectoryRecreatable: false,
        workingDirectory: 'not-set',
      },
      detection,
      system,
      experimental: NO_EXPERIMENTS,
    });
    expect(report.state).toBe('Unsupported');
    expect(report.launch.available).toBe(false);
  });

  it('detects the macOS app bundle and its version', async () => {
    const system = fakeSystem({
      platform: 'darwin',
      homeDir: '/Users/ana',
      files: fakeFiles(
        { '/Applications/Claude.app': 'dir' },
        {
          '/Applications/Claude.app/Contents/Info.plist':
            '<key>CFBundleShortVersionString</key>\n\t<string>0.14.10</string>',
        },
      ),
    });
    expect(await adapter.detect(system)).toMatchObject({
      status: 'found',
      executablePath: '/Applications/Claude.app',
      version: '0.14.10',
    });
  });

  it('reports isolation as Unsupported but allows a clearly shared launch when installed', async () => {
    const system = fakeSystem({
      platform: 'win32',
      homeDir: 'C:\\Users\\ana',
      env: { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' },
      files: fakeFiles({ 'C:\\Users\\ana\\AppData\\Local\\AnthropicClaude\\claude.exe': 'file' }),
    });
    const detection = await adapter.detect(system);
    const report = adapter.evaluate({
      profile,
      dataDirectory: null,
      fsState: {
        dataDirectory: 'not-applicable',
        dataDirectoryRecreatable: false,
        workingDirectory: 'not-set',
      },
      detection,
      system,
      experimental: NO_EXPERIMENTS,
    });
    expect(report.state).toBe('Unsupported');
    expect(report.launch).toEqual({ available: true, isolation: 'shared' });
    expect(report.limitations.map((m) => m.code)).toContain(
      'compat.claudeDesktop.limitation.noIsolation',
    );
  });

  it('plans an ordinary launch with no flags or data-directory arguments', () => {
    const plan = adapter.buildLaunchPlan({
      profile,
      dataDirectory: null,
      detection: {
        status: 'found',
        executablePath: '/Applications/Claude.app',
        version: null,
        source: 'known-location',
        checkedAt: '',
      },
      system: fakeSystem({ platform: 'darwin' }),
      experimental: NO_EXPERIMENTS,
    });
    expect(plan).toEqual({
      type: 'desktop',
      target: '/Applications/Claude.app',
      args: [],
      marker: null,
      isolation: 'shared',
    });
    expect(JSON.stringify(plan)).not.toContain('user-data-dir');
  });
});

describe('adapter registry', () => {
  it('registers the initial applications with unique IDs', () => {
    expect(
      createDefaultRegistry()
        .list()
        .map((a) => a.id),
    ).toEqual(['claude-code', 'claude-desktop', 'codex-cli', 'gemini-cli']);
  });
});
