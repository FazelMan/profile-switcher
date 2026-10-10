import { AppFailure } from '@shared/domain/errors';
import { msg, type Message } from '@shared/domain/messages';
import type { CompatibilityReport, DetectionResult } from '@shared/domain/compatibility';
import { isCleanAbsolutePath, pathApiFor } from '../platform';
import type { SystemContext } from '../system';
import { parseVersion, systemEnv } from './detection';
import type {
  AppAdapter,
  DesktopLaunchPlan,
  EvaluationInput,
  ExperimentalIsolation,
  LaunchPlanInput,
} from './types';

export const CLAUDE_DESKTOP_ID = 'claude-desktop';

/** Chromium's option for the profile (user data) directory. Not documented by Anthropic. */
export const USER_DATA_DIR_SWITCH = '--user-data-dir';

/** Final launch argument that points Claude Desktop at a profile's folder. */
export function userDataDirArgument(directory: string): string {
  return `${USER_DATA_DIR_SWITCH}=${directory}`;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Claude Desktop integration.
 *
 * Anthropic does not document a way to run Claude Desktop with separate
 * user-data directories or multiple signed-in accounts. By default the only
 * launch offered is an ordinary, clearly labeled shared launch, and Profile
 * Switcher passes no flags.
 *
 * Separate profiles are an EXPERIMENTAL, opt-in feature (Settings →
 * Experimental). When the user turns it on, a profile with its own folder
 * starts Claude Desktop with Chromium's `--user-data-dir=<folder>` as the
 * last argument. That option is undocumented for Claude Desktop, may stop
 * working with any update, and cannot be verified from outside the app, so:
 * - such profiles report NeedsVerification (isolation `experimental`) until
 *   the user records their own check for the installed version;
 * - the sign-in callback (claude://) is one OS-wide protocol handler and may
 *   reach a different running instance, which the compatibility notes say;
 * - Profile Switcher never reads, writes, or copies anything inside the
 *   profile folder or Claude Desktop's own data, and never handles tokens.
 *
 * Claude Desktop is distributed for macOS and Windows only.
 */
export class ClaudeDesktopAdapter implements AppAdapter {
  readonly id = CLAUDE_DESKTOP_ID;
  readonly displayName = 'Claude Desktop';
  readonly kind = 'desktop' as const;
  readonly supportedPlatforms = ['darwin', 'win32'] as const;
  readonly storageKinds = ['app-default'] as const;
  readonly defaultStorageKind = 'app-default' as const;
  readonly isolationDocumented = false;
  readonly mechanism = msg('mechanism.claudeDesktop');
  readonly supportsWorkingDirectory = false;
  readonly supportsVerification = false;
  readonly supportsCopyCommand = false;
  readonly experimental: ExperimentalIsolation = {
    feature: 'claudeDesktopIsolation',
    storageKinds: ['managed', 'custom'],
    mechanism: msg('mechanism.claudeDesktop.experimental'),
  };

  reservedDirectories(system: SystemContext): string[] {
    const p = pathApiFor(system.platform);
    if (system.platform === 'darwin')
      return [p.join(system.homeDir, 'Library', 'Application Support', 'Claude')];
    if (system.platform === 'win32') {
      const appData = systemEnv(system, 'APPDATA') ?? p.join(system.homeDir, 'AppData', 'Roaming');
      return [p.join(appData, 'Claude')];
    }
    return [];
  }

  private candidates(system: SystemContext): string[] {
    const p = pathApiFor(system.platform);
    if (system.platform === 'darwin') {
      return ['/Applications/Claude.app', p.join(system.homeDir, 'Applications', 'Claude.app')];
    }
    if (system.platform === 'win32') {
      const local = systemEnv(system, 'LOCALAPPDATA') ?? p.join(system.homeDir, 'AppData', 'Local');
      const programFiles = systemEnv(system, 'ProgramFiles') ?? 'C:\\Program Files';
      return [
        p.join(local, 'AnthropicClaude', 'claude.exe'),
        p.join(local, 'Programs', 'Claude', 'Claude.exe'),
        p.join(programFiles, 'Claude', 'Claude.exe'),
      ];
    }
    return [];
  }

  /**
   * Windows installs keep each version in an `app-<version>` folder next to
   * the launcher; the newest one is the version that runs.
   */
  private async windowsVersion(system: SystemContext, executable: string): Promise<string | null> {
    const p = pathApiFor('win32');
    const entries = await system.files.listDirectory(p.dirname(executable));
    const versions = (entries ?? [])
      .map((entry) => /^app-(\d+\.\d+\.\d+)$/.exec(entry)?.[1])
      .filter((version): version is string => version !== undefined)
      .sort(compareVersions);
    return versions.at(-1) ?? null;
  }

  async detect(system: SystemContext): Promise<DetectionResult> {
    const checkedAt = new Date().toISOString();
    if (system.platform !== 'darwin' && system.platform !== 'win32') {
      return {
        status: 'unsupported-platform',
        executablePath: null,
        version: null,
        source: null,
        checkedAt,
      };
    }
    for (const candidate of this.candidates(system)) {
      if (!isCleanAbsolutePath(candidate, system.platform)) continue;
      const stat = await system.files.stat(candidate);
      const found = system.platform === 'darwin' ? stat?.isDirectory : stat?.isFile;
      if (!found) continue;
      let version: string | null;
      if (system.platform === 'darwin') {
        const plist = await system.files.readTextFile(
          pathApiFor('darwin').join(candidate, 'Contents', 'Info.plist'),
          64 * 1024,
        );
        const match = plist
          ? /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)
          : null;
        version = match?.[1] ? parseVersion(match[1]) : null;
      } else {
        version = await this.windowsVersion(system, candidate);
      }
      return {
        status: 'found',
        executablePath: candidate,
        version,
        source: 'known-location',
        checkedAt,
      };
    }
    return { status: 'not-found', executablePath: null, version: null, source: null, checkedAt };
  }

  evaluate(input: EvaluationInput): CompatibilityReport {
    return input.profile.storage.kind === 'app-default'
      ? this.evaluateShared(input)
      : this.evaluateExperimental(input);
  }

  private evaluateShared({ detection }: EvaluationInput): CompatibilityReport {
    if (detection.status === 'unsupported-platform') {
      return {
        state: 'Unsupported',
        launch: { available: false, isolation: 'shared' },
        summary: msg('compat.claudeDesktop.unsupportedPlatform.summary'),
        guarantees: [],
        limitations: [msg('compat.claudeDesktop.limitation.noIsolation')],
        guidance: [],
      };
    }
    if (detection.status === 'not-found') {
      return {
        state: 'ApplicationNotFound',
        launch: { available: false, isolation: 'shared' },
        summary: msg('compat.appNotFound.summary', { app: this.displayName }),
        guarantees: [],
        limitations: [msg('compat.claudeDesktop.limitation.noIsolation')],
        guidance: [
          msg('compat.claudeDesktop.guidance.install'),
          msg('compat.guidance.refreshDetection'),
        ],
      };
    }
    return {
      state: 'Unsupported',
      launch: { available: true, isolation: 'shared' },
      summary: msg('compat.claudeDesktop.summary'),
      guarantees: [msg('compat.claudeDesktop.guarantee.opensApp')],
      limitations: [
        msg('compat.claudeDesktop.limitation.noIsolation'),
        msg('compat.claudeDesktop.limitation.noConcurrent'),
        msg('compat.claudeDesktop.limitation.singleInstance'),
      ],
      guidance: [
        msg('compat.claudeDesktop.guidance.switchInApp'),
        msg('compat.claudeDesktop.guidance.enableExperimental'),
      ],
    };
  }

  private evaluateExperimental({
    profile,
    fsState,
    detection,
    experimental,
  }: EvaluationInput): CompatibilityReport {
    const unavailable = { available: false, isolation: 'experimental' } as const;
    const limitations: Message[] = [
      msg('compat.claudeDesktop.experimental.limitation.undocumented'),
      msg('compat.claudeDesktop.experimental.limitation.signInCallback'),
      msg('compat.claudeDesktop.experimental.limitation.notVerifiable'),
      msg('compat.claudeDesktop.experimental.limitation.sharedSystem'),
    ];

    if (detection.status === 'unsupported-platform') {
      return {
        state: 'Unsupported',
        launch: unavailable,
        summary: msg('compat.claudeDesktop.unsupportedPlatform.summary'),
        guarantees: [],
        limitations: [],
        guidance: [],
      };
    }
    if (!experimental.claudeDesktopIsolation) {
      // Never fall back to a shared launch: that would open whichever
      // account Claude Desktop's normal data holds, not this profile's.
      return {
        state: 'Unsupported',
        launch: unavailable,
        summary: msg('compat.claudeDesktop.experimental.disabled.summary'),
        guarantees: [],
        limitations,
        guidance: [msg('compat.claudeDesktop.guidance.enableExperimental')],
      };
    }

    const configErrors: Message[] = [];
    if (fsState.dataDirectory === 'missing' && !fsState.dataDirectoryRecreatable)
      configErrors.push(msg('compat.configError.directoryMissing'));
    if (fsState.dataDirectory === 'not-directory')
      configErrors.push(msg('compat.configError.directoryNotDirectory'));
    if (configErrors.length > 0) {
      return {
        state: 'ConfigurationError',
        launch: unavailable,
        summary: configErrors[0] as Message,
        guarantees: [],
        limitations: configErrors.slice(1),
        guidance: [msg('compat.guidance.recreateProfile')],
      };
    }

    if (detection.status === 'not-found') {
      return {
        state: 'ApplicationNotFound',
        launch: unavailable,
        summary: msg('compat.appNotFound.summary', { app: this.displayName }),
        guarantees: [],
        limitations,
        guidance: [
          msg('compat.claudeDesktop.guidance.install'),
          msg('compat.guidance.refreshDetection'),
        ],
      };
    }

    const check = profile.manualCheck;
    const checkedThisVersion = check !== null && check.appVersion === detection.version;
    return {
      state: checkedThisVersion ? 'Supported' : 'NeedsVerification',
      launch: { available: true, isolation: 'experimental' },
      summary: checkedThisVersion
        ? msg('compat.claudeDesktop.experimental.checkedSummary')
        : check
          ? msg('compat.claudeDesktop.experimental.versionChanged')
          : msg('compat.claudeDesktop.experimental.summary'),
      guarantees: [
        msg('compat.claudeDesktop.experimental.guarantee.folder'),
        msg('compat.claudeDesktop.experimental.guarantee.untouched'),
      ],
      limitations,
      guidance: [
        msg('compat.claudeDesktop.experimental.guidance.signInOneAtATime'),
        msg('compat.claudeDesktop.experimental.guidance.check'),
      ],
    };
  }

  buildLaunchPlan({
    profile,
    dataDirectory,
    detection,
    system,
    experimental,
  }: LaunchPlanInput): DesktopLaunchPlan {
    if (detection.status === 'unsupported-platform') {
      throw new AppFailure('APP_UNSUPPORTED_PLATFORM', { app: this.displayName });
    }
    if (detection.status !== 'found' || !detection.executablePath) {
      throw new AppFailure('APP_NOT_FOUND', { app: this.displayName });
    }
    if (profile.storage.kind === 'app-default') {
      return {
        type: 'desktop',
        target: detection.executablePath,
        args: [],
        marker: null,
        isolation: 'shared',
      };
    }
    if (!experimental.claudeDesktopIsolation) {
      throw new AppFailure('LAUNCH_NOT_AVAILABLE', { state: 'Unsupported' });
    }
    if (!dataDirectory || !isCleanAbsolutePath(dataDirectory, system.platform)) {
      throw new AppFailure('DIRECTORY_MISSING');
    }
    const marker = userDataDirArgument(dataDirectory);
    return {
      type: 'desktop',
      target: detection.executablePath,
      args: [marker],
      marker,
      isolation: 'experimental',
    };
  }
}
