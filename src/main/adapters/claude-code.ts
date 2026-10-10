import { AppFailure } from '@shared/domain/errors';
import { msg, type Message } from '@shared/domain/messages';
import type { CompatibilityReport, DetectionResult } from '@shared/domain/compatibility';
import type { CommandShell } from '@shared/domain/compatibility';
import type { VerificationReport } from '@shared/ipc';
import {
  activeProviderVariables,
  applyEnvChanges,
  CLAUDE_CREDENTIAL_OVERRIDE_VARS,
  CLAUDE_PROVIDER_SWITCHES,
  presentVariables,
  type EnvChanges,
} from '../launch/environment';
import { isWindowsShim, windowsShimInvocation } from '../launch/quoting';
import { isSupportedPlatform, pathApiFor, samePath } from '../platform';
import type { SystemContext } from '../system';
import { findExecutable, parseVersion, windowsComspec } from './detection';
import type { AppAdapter, CliLaunchPlan, EvaluationInput, LaunchPlanInput } from './types';

export const CLAUDE_CODE_ID = 'claude-code';

/** Documented variable that relocates Claude Code's configuration directory. */
export const CLAUDE_CONFIG_DIR_VAR = 'CLAUDE_CONFIG_DIR';

const VERSION_TIMEOUT_MS = 8_000;
const VERIFY_TIMEOUT_MS = 20_000;

function knownLocations(system: SystemContext): string[] {
  const p = pathApiFor(system.platform);
  const home = system.homeDir;
  if (system.platform === 'win32') {
    const appData = system.env.APPDATA ?? p.join(home, 'AppData', 'Roaming');
    return [p.join(home, '.local', 'bin', 'claude.exe'), p.join(appData, 'npm', 'claude.cmd')];
  }
  return [
    p.join(home, '.local', 'bin', 'claude'), // native installer
    p.join(home, '.claude', 'local', 'claude'), // legacy local install
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    p.join(home, '.npm-global', 'bin', 'claude'),
    p.join(home, '.volta', 'bin', 'claude'),
    '/usr/bin/claude',
  ];
}

/** Claude Code's own default configuration directory (no CLAUDE_CONFIG_DIR). */
export function claudeCodeDefaultConfigDir(system: SystemContext): string {
  return pathApiFor(system.platform).join(system.homeDir, '.claude');
}

function invocation(system: SystemContext, executable: string, args: string[]) {
  if (system.platform === 'win32' && isWindowsShim(executable)) {
    return windowsShimInvocation(executable, args, '/c', windowsComspec(system));
  }
  return { file: executable, args, windowsVerbatimArguments: false };
}

function credentialOverridesInEffect(profileInherits: boolean, system: SystemContext): string[] {
  if (!profileInherits) return [];
  return presentVariables(system.env, CLAUDE_CREDENTIAL_OVERRIDE_VARS, system.platform);
}

/**
 * Environment changes for a Claude Code launch. Exported for tests and for
 * the copy-command feature so the two can never drift apart.
 */
export function claudeCodeEnvChanges(
  profile: { storage: { kind: string }; launch: { inheritCredentialEnv: boolean } },
  dataDirectory: string | null,
  executable: string,
  platform: NodeJS.Platform,
): EnvChanges {
  const p = pathApiFor(platform);
  const unset: string[] = profile.launch.inheritCredentialEnv
    ? []
    : [...CLAUDE_CREDENTIAL_OVERRIDE_VARS];
  const set: Record<string, string> = {};
  if (profile.storage.kind === 'app-default' || dataDirectory === null) {
    // "Application default" must mean Claude Code's own default, even if
    // Profile Switcher itself was started with CLAUDE_CONFIG_DIR set.
    unset.push(CLAUDE_CONFIG_DIR_VAR);
  } else {
    set[CLAUDE_CONFIG_DIR_VAR] = dataDirectory;
  }
  // GUI apps (notably on macOS) start with a minimal PATH. Prepending the
  // executable's directory lets npm/Homebrew installs find their `node`.
  return { set, unset, prependPath: [p.dirname(executable)] };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 200) : null;
}

function pick(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = readString(source[key]);
    if (direct) return direct;
  }
  return null;
}

export class ClaudeCodeAdapter implements AppAdapter {
  readonly id = CLAUDE_CODE_ID;
  readonly displayName = 'Claude Code';
  readonly kind = 'cli' as const;
  readonly supportedPlatforms = ['darwin', 'win32', 'linux'] as const;
  readonly storageKinds = ['managed', 'custom', 'app-default'] as const;
  readonly defaultStorageKind = 'managed' as const;
  readonly isolationDocumented = true;
  readonly mechanism = msg('mechanism.claudeCode');
  readonly supportsWorkingDirectory = true;
  readonly supportsVerification = true;
  readonly supportsCopyCommand = true;
  readonly credentialVariables = CLAUDE_CREDENTIAL_OVERRIDE_VARS;
  readonly providerVariables = CLAUDE_PROVIDER_SWITCHES;

  reservedDirectories(system: SystemContext): string[] {
    return [claudeCodeDefaultConfigDir(system)];
  }

  shellsFor(platform: NodeJS.Platform): CommandShell[] {
    return platform === 'win32' ? ['powershell', 'cmd'] : ['posix', 'fish'];
  }

  async detect(system: SystemContext): Promise<DetectionResult> {
    const checkedAt = new Date().toISOString();
    if (!isSupportedPlatform(system.platform)) {
      return {
        status: 'unsupported-platform',
        executablePath: null,
        version: null,
        source: null,
        checkedAt,
      };
    }
    const match = await findExecutable(system, 'claude', knownLocations(system));
    if (!match)
      return { status: 'not-found', executablePath: null, version: null, source: null, checkedAt };

    // `claude --version` reads no configuration and writes nothing (verified
    // with Claude Code 2.1.x). Credential variables are stripped anyway.
    const env = applyEnvChanges(
      system.env,
      {
        set: {},
        unset: [...CLAUDE_CREDENTIAL_OVERRIDE_VARS],
        prependPath: [pathApiFor(system.platform).dirname(match.path)],
      },
      system.platform,
    );
    let version: string | null = null;
    try {
      const call = invocation(system, match.path, ['--version']);
      const result = await system.runner.run(call.file, call.args, {
        env,
        timeoutMs: VERSION_TIMEOUT_MS,
        maxOutputBytes: 4096,
        windowsVerbatimArguments: call.windowsVerbatimArguments,
      });
      if (result.exitCode === 0) version = parseVersion(result.stdout);
    } catch {
      version = null;
    }
    return {
      status: 'found',
      executablePath: match.path,
      version,
      source: match.source,
      checkedAt,
    };
  }

  evaluate({ profile, fsState, detection, system }: EvaluationInput): CompatibilityReport {
    const isolatedStorage = profile.storage.kind !== 'app-default';
    const isolation = isolatedStorage ? ('isolated' as const) : ('shared' as const);
    const signInGuidance = msg('compat.claudeCode.guidance.signIn');

    if (detection.status === 'unsupported-platform') {
      return {
        state: 'Unsupported',
        launch: { available: false, isolation },
        summary: msg('compat.unsupportedPlatform.summary', { app: this.displayName }),
        guarantees: [],
        limitations: [],
        guidance: [],
      };
    }

    const configErrors: Message[] = [];
    if (fsState.dataDirectory === 'missing' && !fsState.dataDirectoryRecreatable) {
      configErrors.push(msg('compat.configError.directoryMissing'));
    }
    if (fsState.dataDirectory === 'not-directory')
      configErrors.push(msg('compat.configError.directoryNotDirectory'));
    if (fsState.workingDirectory === 'invalid')
      configErrors.push(msg('compat.configError.workingDirectoryMissing'));
    if (configErrors.length > 0) {
      const first = configErrors[0] as Message;
      return {
        state: 'ConfigurationError',
        launch: { available: false, isolation },
        summary: first,
        guarantees: [],
        limitations: configErrors.slice(1),
        guidance: [
          fsState.workingDirectory === 'invalid'
            ? msg('compat.guidance.editWorkingDirectory')
            : msg('compat.guidance.recreateProfile'),
        ],
      };
    }

    if (detection.status === 'not-found') {
      return {
        state: 'ApplicationNotFound',
        launch: { available: false, isolation },
        summary: msg('compat.appNotFound.summary', { app: this.displayName }),
        guarantees: [],
        limitations: [],
        guidance: [
          msg('compat.claudeCode.guidance.install'),
          msg('compat.guidance.refreshDetection'),
        ],
      };
    }

    const sharedLimitations: Message[] = [
      msg('compat.claudeCode.limitation.projectFiles'),
      msg('compat.claudeCode.limitation.managedSettings'),
      msg('compat.claudeCode.limitation.entitlements'),
    ];

    if (!isolatedStorage) {
      return {
        state: 'Supported',
        launch: { available: true, isolation: 'shared' },
        summary: msg('compat.claudeCode.shared.summary'),
        guarantees: [],
        limitations: [msg('compat.claudeCode.shared.limitation'), ...sharedLimitations],
        guidance: [],
      };
    }

    const guarantees = [
      msg('compat.claudeCode.isolated.guarantee.configDir'),
      msg('compat.claudeCode.isolated.guarantee.credentials'),
      msg('compat.claudeCode.isolated.guarantee.history'),
      msg('compat.claudeCode.isolated.guarantee.concurrent'),
    ];
    const limitations = [msg('compat.claudeCode.limitation.consoleKeyless'), ...sharedLimitations];
    const guidance = [signInGuidance, msg('compat.claudeCode.guidance.verify')];

    const inherited = credentialOverridesInEffect(profile.launch.inheritCredentialEnv, system);
    const providers = activeProviderVariables(system.env, system.platform);

    if (inherited.length > 0) {
      return {
        state: 'NeedsVerification',
        launch: { available: true, isolation },
        summary: msg('compat.claudeCode.needsVerification.credentialEnv', {
          variables: inherited.join(', '),
        }),
        guarantees: [guarantees[0] as Message],
        limitations: [msg('compat.claudeCode.limitation.credentialEnvInherited'), ...limitations],
        guidance,
      };
    }
    if (providers.length > 0) {
      return {
        state: 'NeedsVerification',
        launch: { available: true, isolation },
        summary: msg('compat.claudeCode.needsVerification.providerEnv', {
          variables: providers.join(', '),
        }),
        guarantees: [guarantees[0] as Message],
        limitations: [msg('compat.claudeCode.limitation.providerEnv'), ...limitations],
        guidance: [msg('compat.claudeCode.guidance.unsetProviderEnv'), ...guidance],
      };
    }
    if (detection.version === null) {
      return {
        state: 'NeedsVerification',
        launch: { available: true, isolation },
        summary: msg('compat.claudeCode.versionUnknown.summary'),
        guarantees,
        limitations,
        guidance,
      };
    }

    return {
      state: 'Supported',
      launch: { available: true, isolation },
      summary: msg('compat.claudeCode.isolated.summary', { version: detection.version }),
      guarantees,
      limitations,
      guidance,
    };
  }

  buildLaunchPlan({ profile, dataDirectory, detection, system }: LaunchPlanInput): CliLaunchPlan {
    if (detection.status !== 'found' || !detection.executablePath) {
      throw new AppFailure('APP_NOT_FOUND', { app: this.displayName });
    }
    if (profile.storage.kind !== 'app-default' && !dataDirectory) {
      throw new AppFailure('DIRECTORY_MISSING');
    }
    return {
      type: 'cli',
      executable: detection.executablePath,
      args: [],
      env: claudeCodeEnvChanges(profile, dataDirectory, detection.executablePath, system.platform),
      cwd: profile.launch.workingDirectory ?? system.homeDir,
      isolation: profile.storage.kind === 'app-default' ? 'shared' : 'isolated',
    };
  }

  /**
   * Asks the installed Claude Code which configuration directory it resolves
   * for this profile's environment (`claude auth status --json`). This is the
   * evidence behind "isolation verified": the application itself reports the
   * directory, rather than Profile Switcher assuming it.
   */
  async verify(input: LaunchPlanInput): Promise<VerificationReport> {
    const plan = this.buildLaunchPlan(input);
    const { system, dataDirectory } = input;
    const expected = dataDirectory ?? claudeCodeDefaultConfigDir(system);
    const env = applyEnvChanges(system.env, plan.env, system.platform);
    const call = invocation(system, plan.executable, ['auth', 'status', '--json']);
    const result = await system.runner.run(call.file, call.args, {
      env,
      cwd: system.homeDir,
      timeoutMs: VERIFY_TIMEOUT_MS,
      maxOutputBytes: 64 * 1024,
      windowsVerbatimArguments: call.windowsVerbatimArguments,
    });

    if (result.timedOut)
      throw new AppFailure('VERIFICATION_FAILED', { reason: 'timeout' }, 'auth status timed out');
    if (result.exitCode === null) {
      throw new AppFailure(
        'VERIFICATION_FAILED',
        { reason: 'not-started' },
        'auth status could not be started',
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new AppFailure(
        'VERIFICATION_FAILED',
        { reason: 'unreadable-output' },
        `auth status exit=${String(result.exitCode)}; output was not JSON`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new AppFailure(
        'VERIFICATION_FAILED',
        { reason: 'unreadable-output' },
        'auth status JSON was not an object',
      );
    }
    const data = parsed as Record<string, unknown>;
    const account = (
      typeof data.account === 'object' && data.account !== null ? data.account : {}
    ) as Record<string, unknown>;
    const reported = readString(data.configDirectory);

    return {
      verifiedAt: new Date().toISOString(),
      appVersion: input.detection.version,
      expectedConfigDirectory: expected,
      reportedConfigDirectory: reported,
      configDirectoryMatches: reported !== null && samePath(reported, expected, system.platform),
      loggedIn: typeof data.loggedIn === 'boolean' ? data.loggedIn : null,
      authMethod: readString(data.authMethod),
      account: {
        email: pick(data, ['email', 'emailAddress']) ?? pick(account, ['email', 'emailAddress']),
        organization:
          pick(data, ['orgName', 'organizationName']) ??
          pick(account, ['orgName', 'organizationName']),
        subscription: pick(data, ['subscriptionType']) ?? pick(account, ['subscriptionType']),
      },
      strippedVariables: presentVariables(
        system.env,
        plan.env.unset.filter((name) => name !== CLAUDE_CONFIG_DIR_VAR),
        system.platform,
      ),
    };
  }
}
