import { AppFailure } from '@shared/domain/errors';
import { msg, type Message } from '@shared/domain/messages';
import type {
  CommandShell,
  CompatibilityReport,
  DetectionResult,
} from '@shared/domain/compatibility';
import type { VerificationReport } from '@shared/ipc';
import {
  activeVariables,
  applyEnvChanges,
  presentVariables,
  type EnvChanges,
  type EnvSwitch,
} from '../launch/environment';
import { isWindowsShim, windowsShimInvocation } from '../launch/quoting';
import { isSupportedPlatform, pathApiFor } from '../platform';
import type { RunResult, SystemContext } from '../system';
import { findExecutable, parseVersion, windowsComspec } from './detection';
import type {
  AppAdapter,
  CliLaunchPlan,
  DetectContext,
  EvaluationInput,
  LaunchPlanInput,
} from './types';

const VERSION_TIMEOUT_MS = 10_000;
const VERIFY_TIMEOUT_MS = 20_000;

/** What `<tool> <statusArgs>` reported about the sign-in. */
export interface StatusReading {
  loggedIn: boolean | null;
  authMethod: string | null;
}

/**
 * Describes a command-line tool whose whole configuration, including its
 * stored sign-in, moves to the folder named by one documented environment
 * variable (Codex CLI: CODEX_HOME, Gemini CLI: GEMINI_CLI_HOME).
 */
export interface EnvHomeCliSpec {
  id: string;
  displayName: string;
  executableName: string;
  /** The documented variable that relocates the tool's configuration. */
  homeVariable: string;
  /** The tool's own default configuration folders (reserved for custom profile folders). */
  reservedDirectories(system: SystemContext): string[];
  knownLocations(system: SystemContext): string[];
  /** Removed from launches by default: they would replace the profile's own sign-in. */
  credentialVariables: readonly string[];
  /** Reported, not removed: per-profile sign-in does not apply while they are active. */
  providerVariables: readonly EnvSwitch[];
  mechanism: Message;
  /** Shown in the generic project-files limitation, e.g. "AGENTS.md and .codex/". */
  projectFiles: string;
  messages: {
    credentials: Message;
    signIn: Message;
    extraLimitations: Message[];
  };
  /** A command that reports the sign-in without changing anything, if the tool has one. */
  status?: {
    args: string[];
    parse(result: RunResult): StatusReading | null;
  };
}

function invocation(system: SystemContext, executable: string, args: string[]) {
  if (system.platform === 'win32' && isWindowsShim(executable)) {
    return windowsShimInvocation(executable, args, '/c', windowsComspec(system));
  }
  return { file: executable, args, windowsVerbatimArguments: false };
}

/**
 * Environment changes for a launch. The profile folder is set in the
 * documented variable; credential variables are removed unless the profile
 * opts in; "application default" removes the variable so the tool uses its
 * own default even if Profile Switcher was started with it set.
 */
export function envHomeChanges(
  spec: Pick<EnvHomeCliSpec, 'homeVariable' | 'credentialVariables'>,
  profile: { storage: { kind: string }; launch: { inheritCredentialEnv: boolean } },
  dataDirectory: string | null,
  executable: string,
  platform: NodeJS.Platform,
): EnvChanges {
  const unset: string[] = profile.launch.inheritCredentialEnv ? [] : [...spec.credentialVariables];
  const set: Record<string, string> = {};
  if (profile.storage.kind === 'app-default' || dataDirectory === null)
    unset.push(spec.homeVariable);
  else set[spec.homeVariable] = dataDirectory;
  // GUI apps start with a minimal PATH; npm installs need their `node`.
  return { set, unset, prependPath: [pathApiFor(platform).dirname(executable)] };
}

export class EnvHomeCliAdapter implements AppAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly kind = 'cli' as const;
  readonly supportedPlatforms = ['darwin', 'win32', 'linux'] as const;
  readonly storageKinds = ['managed', 'custom', 'app-default'] as const;
  readonly defaultStorageKind = 'managed' as const;
  readonly isolationDocumented = true;
  readonly mechanism: Message;
  readonly supportsWorkingDirectory = true;
  readonly supportsVerification: boolean;
  readonly supportsCopyCommand = true;
  readonly credentialVariables: readonly string[];
  readonly providerVariables: readonly EnvSwitch[];

  constructor(private readonly spec: EnvHomeCliSpec) {
    this.id = spec.id;
    this.displayName = spec.displayName;
    this.mechanism = spec.mechanism;
    this.supportsVerification = spec.status !== undefined;
    this.credentialVariables = spec.credentialVariables;
    this.providerVariables = spec.providerVariables;
  }

  reservedDirectories(system: SystemContext): string[] {
    return this.spec.reservedDirectories(system);
  }

  shellsFor(platform: NodeJS.Platform): CommandShell[] {
    return platform === 'win32' ? ['powershell', 'cmd'] : ['posix', 'fish'];
  }

  async detect(system: SystemContext, context?: DetectContext): Promise<DetectionResult> {
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
    const match = await findExecutable(
      system,
      this.spec.executableName,
      this.spec.knownLocations(system),
    );
    if (!match)
      return { status: 'not-found', executablePath: null, version: null, source: null, checkedAt };

    // Both tools write into their configuration folder even for --version, so
    // the version is read with that folder pointed at Profile Switcher's own
    // scratch folder, never at the user's default or a profile.
    let version: string | null = null;
    if (context?.scratchDir) {
      const env = applyEnvChanges(
        system.env,
        {
          set: { [this.spec.homeVariable]: context.scratchDir },
          unset: [...this.spec.credentialVariables],
          prependPath: [pathApiFor(system.platform).dirname(match.path)],
        },
        system.platform,
      );
      try {
        const call = invocation(system, match.path, ['--version']);
        const result = await system.runner.run(call.file, call.args, {
          env,
          cwd: context.scratchDir,
          timeoutMs: VERSION_TIMEOUT_MS,
          maxOutputBytes: 4096,
          windowsVerbatimArguments: call.windowsVerbatimArguments,
        });
        if (result.exitCode === 0) version = parseVersion(result.stdout);
      } catch {
        version = null;
      }
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
    const app = this.displayName;
    const variable = this.spec.homeVariable;
    const isolatedStorage = profile.storage.kind !== 'app-default';
    const isolation = isolatedStorage ? ('isolated' as const) : ('shared' as const);

    if (detection.status === 'unsupported-platform') {
      return {
        state: 'Unsupported',
        launch: { available: false, isolation },
        summary: msg('compat.unsupportedPlatform.summary', { app }),
        guarantees: [],
        limitations: [],
        guidance: [],
      };
    }

    const configErrors: Message[] = [];
    if (fsState.dataDirectory === 'missing' && !fsState.dataDirectoryRecreatable)
      configErrors.push(msg('compat.configError.directoryMissing'));
    if (fsState.dataDirectory === 'not-directory')
      configErrors.push(msg('compat.configError.directoryNotDirectory'));
    if (fsState.workingDirectory === 'invalid')
      configErrors.push(msg('compat.configError.workingDirectoryMissing'));
    if (configErrors.length > 0) {
      return {
        state: 'ConfigurationError',
        launch: { available: false, isolation },
        summary: configErrors[0] as Message,
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
        summary: msg('compat.appNotFound.summary', { app }),
        guarantees: [],
        limitations: [],
        guidance: [
          msg('compat.cli.guidance.install', { app }),
          msg('compat.guidance.refreshDetection'),
        ],
      };
    }

    const sharedLimitations: Message[] = [
      msg('compat.cli.limitation.projectFiles', { files: this.spec.projectFiles }),
      msg('compat.cli.limitation.entitlements'),
    ];

    if (!isolatedStorage) {
      return {
        state: 'Supported',
        launch: { available: true, isolation: 'shared' },
        summary: msg('compat.cli.shared.summary', { app }),
        guarantees: [],
        limitations: [msg('compat.cli.shared.limitation', { app, variable }), ...sharedLimitations],
        guidance: [],
      };
    }

    const guarantees = [
      msg('compat.cli.isolated.guarantee.configDir', { app, variable }),
      this.spec.messages.credentials,
      msg('compat.cli.isolated.guarantee.concurrent', { app }),
    ];
    const limitations = [...this.spec.messages.extraLimitations, ...sharedLimitations];
    const guidance = [
      this.spec.messages.signIn,
      ...(this.supportsVerification ? [msg('compat.cli.guidance.verify', { app })] : []),
    ];

    const inherited = profile.launch.inheritCredentialEnv
      ? presentVariables(system.env, this.spec.credentialVariables, system.platform)
      : [];
    if (inherited.length > 0) {
      return {
        state: 'NeedsVerification',
        launch: { available: true, isolation },
        summary: msg('compat.cli.needsVerification.credentialEnv', {
          variables: inherited.join(', '),
        }),
        guarantees: [guarantees[0] as Message],
        limitations: [msg('compat.cli.limitation.credentialEnvInherited', { app }), ...limitations],
        guidance,
      };
    }
    const providers = activeVariables(system.env, this.spec.providerVariables, system.platform);
    if (providers.length > 0) {
      return {
        state: 'NeedsVerification',
        launch: { available: true, isolation },
        summary: msg('compat.cli.needsVerification.providerEnv', {
          variables: providers.join(', '),
        }),
        guarantees: [guarantees[0] as Message],
        limitations,
        guidance: [msg('compat.cli.guidance.unsetProviderEnv'), ...guidance],
      };
    }
    if (detection.version === null) {
      return {
        state: 'NeedsVerification',
        launch: { available: true, isolation },
        summary: msg('compat.cli.versionUnknown.summary', { app }),
        guarantees,
        limitations,
        guidance,
      };
    }
    return {
      state: 'Supported',
      launch: { available: true, isolation },
      summary: msg('compat.cli.isolated.summary', { app, variable, version: detection.version }),
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
      env: envHomeChanges(
        this.spec,
        profile,
        dataDirectory,
        detection.executablePath,
        system.platform,
      ),
      cwd: profile.launch.workingDirectory ?? system.homeDir,
      isolation: profile.storage.kind === 'app-default' ? 'shared' : 'isolated',
    };
  }

  /**
   * Runs the tool's own status command with the profile's exact launch
   * environment. The tool does not report which folder it used, so the
   * report says the folder was set rather than confirmed.
   */
  async verify(input: LaunchPlanInput): Promise<VerificationReport> {
    const status = this.spec.status;
    if (!status) throw new AppFailure('VERIFICATION_NOT_SUPPORTED');
    const plan = this.buildLaunchPlan(input);
    const { system, dataDirectory } = input;
    const env = applyEnvChanges(system.env, plan.env, system.platform);
    const call = invocation(system, plan.executable, status.args);
    const result = await system.runner.run(call.file, call.args, {
      env,
      cwd: system.homeDir,
      timeoutMs: VERIFY_TIMEOUT_MS,
      maxOutputBytes: 64 * 1024,
      windowsVerbatimArguments: call.windowsVerbatimArguments,
    });
    if (result.timedOut)
      throw new AppFailure('VERIFICATION_FAILED', { reason: 'timeout' }, 'status timed out');
    if (result.exitCode === null)
      throw new AppFailure('VERIFICATION_FAILED', { reason: 'not-started' }, 'status not started');
    const reading = status.parse(result);
    if (!reading) {
      throw new AppFailure(
        'VERIFICATION_FAILED',
        { reason: 'unreadable-output' },
        `status exit=${String(result.exitCode)}; output not recognized`,
      );
    }
    return {
      verifiedAt: new Date().toISOString(),
      appVersion: input.detection.version,
      expectedConfigDirectory: dataDirectory ?? this.spec.reservedDirectories(system)[0] ?? '',
      reportedConfigDirectory: null,
      configDirectoryMatches: null,
      loggedIn: reading.loggedIn,
      authMethod: reading.authMethod,
      account: { email: null, organization: null, subscription: null },
      strippedVariables: presentVariables(
        system.env,
        plan.env.unset.filter((name) => name !== this.spec.homeVariable),
        system.platform,
      ),
    };
  }
}
