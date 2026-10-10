import type {
  AppKind,
  CommandShell,
  CompatibilityReport,
  DetectionResult,
} from '@shared/domain/compatibility';
import type { Message } from '@shared/domain/messages';
import type { IsolationLevel, Profile, StorageKind } from '@shared/domain/profile';
import type { VerificationReport } from '@shared/ipc';
import type { EnvChanges } from '../launch/environment';
import type { SupportedPlatform } from '../platform';
import type { SystemContext } from '../system';

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
  isolation: IsolationLevel;
}

export type LaunchPlan = CliLaunchPlan | DesktopLaunchPlan;

export interface LaunchPlanInput {
  profile: Profile;
  dataDirectory: string | null;
  detection: DetectionResult;
  system: SystemContext;
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

  /** The application's own default configuration locations. Custom profile directories may not overlap these. */
  reservedDirectories(system: SystemContext): string[];

  detect(system: SystemContext): Promise<DetectionResult>;

  evaluate(input: EvaluationInput): CompatibilityReport;

  /** Throws AppFailure when a launch is not possible. */
  buildLaunchPlan(input: LaunchPlanInput): LaunchPlan;

  verify?(input: LaunchPlanInput): Promise<VerificationReport>;

  shellsFor?(platform: NodeJS.Platform): CommandShell[];
}
