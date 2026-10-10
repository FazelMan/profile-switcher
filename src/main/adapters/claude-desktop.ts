import { AppFailure } from '@shared/domain/errors';
import { msg } from '@shared/domain/messages';
import type { CompatibilityReport, DetectionResult } from '@shared/domain/compatibility';
import { isCleanAbsolutePath, pathApiFor } from '../platform';
import type { SystemContext } from '../system';
import { parseVersion, systemEnv } from './detection';
import type { AppAdapter, DesktopLaunchPlan, EvaluationInput, LaunchPlanInput } from './types';

export const CLAUDE_DESKTOP_ID = 'claude-desktop';

/**
 * Claude Desktop integration.
 *
 * Anthropic does not document a way to run Claude Desktop with separate
 * user-data directories or multiple signed-in accounts. Community tools pass
 * Chromium's `--user-data-dir` flag, but that is an undocumented Electron
 * behavior the vendor may change at any time, and it cannot be verified
 * from outside the app. Per this project's compatibility policy, isolation is
 * therefore reported as Unsupported, and the only launch offered is an
 * ordinary, clearly labeled shared launch. Profile Switcher never passes
 * undocumented flags and never touches Claude Desktop's data directory.
 *
 * Concurrent instances with different accounts are likewise reported as
 * unsupported: nothing in the vendor documentation establishes that two
 * instances can run side by side safely (the claude:// sign-in callback is a
 * single, OS-wide protocol handler), and this project has no verified
 * evidence for any OS. docs/manual-test-plan.md describes how to gather that
 * evidence on real installations before this adapter could change.
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
      let version: string | null = null;
      if (system.platform === 'darwin') {
        const plist = await system.files.readTextFile(
          pathApiFor('darwin').join(candidate, 'Contents', 'Info.plist'),
          64 * 1024,
        );
        const match = plist
          ? /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)
          : null;
        version = match?.[1] ? parseVersion(match[1]) : null;
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

  evaluate({ detection }: EvaluationInput): CompatibilityReport {
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
      guidance: [msg('compat.claudeDesktop.guidance.switchInApp')],
    };
  }

  buildLaunchPlan({ detection }: LaunchPlanInput): DesktopLaunchPlan {
    if (detection.status === 'unsupported-platform') {
      throw new AppFailure('APP_UNSUPPORTED_PLATFORM', { app: this.displayName });
    }
    if (detection.status !== 'found' || !detection.executablePath) {
      throw new AppFailure('APP_NOT_FOUND', { app: this.displayName });
    }
    return { type: 'desktop', target: detection.executablePath, isolation: 'shared' };
  }
}
