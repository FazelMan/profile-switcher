import { vi } from 'vitest';
import type { AppSummary, CompatibilityReport } from '../../src/shared/domain/compatibility';
import type { Result } from '../../src/shared/domain/errors';
import { DEFAULT_SETTINGS } from '../../src/shared/domain/settings';
import type {
  DirectoryChoice,
  ProfileSwitcherApi,
  ProfileView,
  RuntimeSnapshot,
  Snapshot,
} from '../../src/shared/ipc';

export const claudeCodeApp: AppSummary = {
  id: 'claude-code',
  displayName: 'Claude Code',
  kind: 'cli',
  platformSupported: true,
  storageKinds: ['managed', 'custom', 'app-default'],
  defaultStorageKind: 'managed',
  isolationDocumented: true,
  mechanism: { code: 'mechanism.claudeCode' },
  supportsWorkingDirectory: true,
  supportsVerification: true,
  supportsCopyCommand: true,
  copyCommandShells: ['posix', 'fish'],
  detection: {
    status: 'found',
    executablePath: '/usr/bin/claude',
    version: '2.1.0',
    source: 'path',
    checkedAt: new Date().toISOString(),
  },
};

export const claudeDesktopApp: AppSummary = {
  id: 'claude-desktop',
  displayName: 'Claude Desktop',
  kind: 'desktop',
  platformSupported: true,
  storageKinds: ['app-default'],
  defaultStorageKind: 'app-default',
  isolationDocumented: false,
  mechanism: { code: 'mechanism.claudeDesktop' },
  supportsWorkingDirectory: false,
  supportsVerification: false,
  supportsCopyCommand: false,
  copyCommandShells: [],
  detection: {
    status: 'found',
    executablePath: '/Applications/Claude.app',
    version: null,
    source: 'known-location',
    checkedAt: new Date().toISOString(),
  },
};

export const isolatedReport: CompatibilityReport = {
  state: 'Supported',
  launch: { available: true, isolation: 'isolated' },
  summary: { code: 'compat.claudeCode.isolated.summary', params: { version: '2.1.0' } },
  guarantees: [{ code: 'compat.claudeCode.isolated.guarantee.configDir' }],
  limitations: [{ code: 'compat.claudeCode.limitation.entitlements' }],
  guidance: [{ code: 'compat.claudeCode.guidance.signIn' }],
};

export const desktopReport: CompatibilityReport = {
  state: 'Unsupported',
  launch: { available: true, isolation: 'shared' },
  summary: { code: 'compat.claudeDesktop.summary' },
  guarantees: [{ code: 'compat.claudeDesktop.guarantee.opensApp' }],
  limitations: [{ code: 'compat.claudeDesktop.limitation.noIsolation' }],
  guidance: [{ code: 'compat.claudeDesktop.guidance.switchInApp' }],
};

export function makeProfile(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
    id: 'work-abc234',
    appId: 'claude-code',
    name: 'Work',
    description: '',
    color: 'violet',
    storage: { kind: 'managed' },
    launch: { workingDirectory: null, inheritCredentialEnv: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLaunch: null,
    dataDirectory: '/data/profiles/claude-code/work-abc234',
    compatibility: isolatedReport,
    ...overrides,
  };
}

export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    appInfo: {
      name: 'Profile Switcher',
      version: '0.1.0',
      appId: 'com.profileswitcher.app',
      electron: '44',
      chrome: '1',
      node: '24',
    },
    environment: {
      platform: 'linux',
      arch: 'x64',
      credentialOverrideVariables: [],
      providerOverrideVariables: [],
      terminals: ['auto', 'xterm'],
    },
    profiles: [],
    apps: [claudeCodeApp, claudeDesktopApp],
    settings: { ...DEFAULT_SETTINGS },
    notices: [],
    readOnly: false,
    lastLaunchedProfileId: null,
    runtime: {},
    ...overrides,
  };
}

const ok = <T>(value: T): Promise<Result<T>> => Promise.resolve({ ok: true, value });

/** In-memory bridge. Every method is a vi.fn so tests can assert calls and override results. */
export function createFakeApi(
  initial: Snapshot = makeSnapshot(),
  runtime: RuntimeSnapshot = initial.runtime,
) {
  let snapshot = initial;
  let counter = 0;
  const api = {
    getSnapshot: vi.fn(() => ok(snapshot)),
    refreshApps: vi.fn(() => ok(snapshot)),
    createProfile: vi.fn((input: Parameters<ProfileSwitcherApi['createProfile']>[0]) => {
      counter += 1;
      const profile = makeProfile({
        id: `${input.name.toLowerCase()}-${counter}`,
        name: input.name.trim(),
        appId: input.appId,
        color: input.color,
        storage:
          input.storage.kind === 'custom'
            ? { kind: 'custom', path: input.storage.path }
            : input.storage,
      });
      snapshot = { ...snapshot, profiles: [...snapshot.profiles, profile] };
      return ok({ snapshot, profileId: profile.id });
    }),
    updateProfile: vi.fn(() => ok(snapshot)),
    deleteProfile: vi.fn((id: string) => {
      const removed = snapshot.profiles.find((p) => p.id === id);
      snapshot = { ...snapshot, profiles: snapshot.profiles.filter((p) => p.id !== id) };
      return ok({ snapshot, retainedDirectory: removed?.dataDirectory ?? null });
    }),
    launchProfile: vi.fn(() =>
      ok({
        snapshot,
        report: {
          method: 'terminal' as const,
          isolation: 'isolated' as const,
          terminal: 'XTerm',
          pid: 1,
          notes: [],
        },
      }),
    ),
    verifyProfile: vi.fn(() =>
      ok({
        verifiedAt: new Date().toISOString(),
        appVersion: '2.1.0',
        expectedConfigDirectory: '/data/profiles/claude-code/work-abc234',
        reportedConfigDirectory: '/data/profiles/claude-code/work-abc234',
        configDirectoryMatches: true,
        loggedIn: true,
        authMethod: 'claude.ai',
        account: { email: 'me@example.com', organization: null, subscription: 'pro' },
        strippedVariables: [],
      }),
    ),
    openProfileDirectory: vi.fn(() => ok(null)),
    copyLaunchCommand: vi.fn(() => ok({ command: 'env claude' })),
    updateSettings: vi.fn(() => ok(snapshot)),
    chooseDirectory: vi.fn((): Promise<Result<DirectoryChoice | null>> => ok(null)),
    getDiagnostics: vi.fn(() =>
      ok({
        generatedAt: '',
        text: 'diagnostics text',
        paths: { metadataFile: '', profilesRoot: '', logsDirectory: '' },
      }),
    ),
    copyDiagnostics: vi.fn(() => ok(null)),
    openLogsDirectory: vi.fn(() => ok(null)),
    openLink: vi.fn(() => ok(null)),
    getRuntime: vi.fn(() => ok(runtime)),
  };
  return api as typeof api & ProfileSwitcherApi;
}
