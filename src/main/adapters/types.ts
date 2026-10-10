import type {
  AppKind,
  CommandShell,
  CompatibilityReport,
  DetectionResult,
} from '@shared/domain/compatibility';
import type { Message } from '@shared/domain/messages';
import type { IsolationLevel, Profile, StorageKind } from '@shared/domain/profile';
import type { ExperimentalFeature, ExperimentalSettings } from '@shared/domain/settings';
import type { VerificationReport } from '@shared/ipc';
import type { EnvChanges, EnvSwitch } from '../launch/environment';
import type { SupportedPlatform } from '../platform';
import type { SystemContext } from '../system';

export interface DetectContext {
  scratchDir: string | null;
}

/** Filesystem state of a profile's directories, gathered before evaluation. */
export interface ProfileFsState {
  dataDirectory: 'ok' | 'missing' | 'not-directory' | 'not-applicable';
  /** Whether the managed directory may be recreated automatically at launch. */
  dataDirectoryRecreatable: boolean;
  workingDirectory: 'ok' | 'invalid' | 'not-set';
}

export interface EvaluationInput {
  profile: Profile;
  dataDirectory: string | null;
  fsState: ProfileFsState;
  detection: DetectionResult;
  system: SystemContext;
  experimental: ExperimentalSettings;
}

/** A command-line application launched inside a terminal window. */
export interface CliLaunchPlan {
  type: 'cli';
  executable: string;
  args: string[];
  env: EnvChanges;
  cwd: string;
  isolation: IsolationLevel;
}

/** A desktop application opened the way the OS normally opens it. */
export interface DesktopLaunchPlan {
  type: 'desktop';
  /** App bundle (macOS) or executable (Windows). */
  target: string;
  /** Arguments for the application. Empty for an ordinary launch. */
  args: string[];
  /**
   * The last argument, unique to this profile, by which the application's
   * main process is found after launch. Null when the launch is not tracked.
   */
  marker: string | null;
  isolation: IsolationLevel;
}

export type LaunchPlan = CliLaunchPlan | DesktopLaunchPlan;

export interface LaunchPlanInput {
  profile: Profile;
  dataDirectory: string | null;
  detection: DetectionResult;
  system: SystemContext;
  experimental: ExperimentalSettings;
}

/**
 * Isolation that rests on undocumented application behavior. Its storage
 * kinds are offered only while the user has turned the feature on.
 */
export interface ExperimentalIsolation {
  feature: ExperimentalFeature;
  storageKinds: readonly StorageKind[];
  mechanism: Message;
}

/**
 * Everything application-specific lives behind this interface. React
 * components and services never branch on application IDs; they read these
 * capabilities and results instead. Adding an application means adding an
 * adapter and registering it.
 */
export interface AppAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly kind: AppKind;
  readonly supportedPlatforms: readonly SupportedPlatform[];
  readonly storageKinds: readonly StorageKind[];
  readonly defaultStorageKind: StorageKind;
  /** True only when the vendor documents the isolation mechanism. */
  readonly isolationDocumented: boolean;
  readonly mechanism: Message;
  readonly supportsWorkingDirectory: boolean;
  readonly supportsVerification: boolean;
  readonly supportsCopyCommand: boolean;
  readonly experimental?: ExperimentalIsolation;
  /** Variables that supply a credential and are removed from launches by default. */
  readonly credentialVariables?: readonly string[];
  /** Variables that switch the application to another provider or credential store. */
  readonly providerVariables?: readonly EnvSwitch[];
  /**
   * The application opens links, including its sign-in page, with the
   * command in BROWSER; Profile Switcher can then give each profile its own
   * browser profile for signing in.
   */
  readonly honorsBrowserVariable?: boolean;
  /** Adapter ID of a desktop app that can be opened with this profile's account. */
  readonly desktopCompanion?: string;

  /** The application's own default configuration locations. Custom profile directories may not overlap these. */
  reservedDirectories(system: SystemContext): string[];

  /**
   * `scratchDir` is an empty folder owned by Profile Switcher, for tools
   * that write files even when only asked for their version.
   */
  detect(system: SystemContext, context?: DetectContext): Promise<DetectionResult>;

  evaluate(input: EvaluationInput): CompatibilityReport;

  /** Throws AppFailure when a launch is not possible. */
  buildLaunchPlan(input: LaunchPlanInput): LaunchPlan;

  verify?(input: LaunchPlanInput): Promise<VerificationReport>;

  shellsFor?(platform: NodeJS.Platform): CommandShell[];
}
