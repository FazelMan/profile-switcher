/**
 * IPC contract shared by main, preload, and renderer.
 *
 * This module is intentionally free of runtime dependencies (no zod) so the
 * sandboxed preload script can import the channel table. Runtime validation
 * of every request happens in the main process (see main/ipc/schemas.ts).
 */
import type { AppSummary, CommandShell, CompatibilityReport } from './domain/compatibility';
import type { AppError, Result } from './domain/errors';
import type { Message } from './domain/messages';
import type {
  CreateProfileInput,
  IsolationLevel,
  LaunchMethod,
  Profile,
  UpdateProfileInput,
} from './domain/profile';
import type { Settings, SettingsPatch, TerminalId } from './domain/settings';
import type { LinkId } from './links';

export const IPC_CHANNELS = {
  getSnapshot: 'snapshot:get',
  refreshApps: 'apps:refresh',
  createProfile: 'profiles:create',
  updateProfile: 'profiles:update',
  deleteProfile: 'profiles:delete',
  launchProfile: 'profiles:launch',
  verifyProfile: 'profiles:verify',
  openProfileDirectory: 'profiles:open-directory',
  copyLaunchCommand: 'profiles:copy-command',
  updateSettings: 'settings:update',
  chooseDirectory: 'dialog:choose-directory',
  getDiagnostics: 'diagnostics:get',
  copyDiagnostics: 'diagnostics:copy',
  openLogsDirectory: 'diagnostics:open-logs',
  openLink: 'links:open',
  getRuntime: 'runtime:get',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface ProfileView extends Profile {
  /** Resolved configuration directory, or null for `app-default` storage. */
  dataDirectory: string | null;
  compatibility: CompatibilityReport;
}

export interface EnvironmentSummary {
  platform: 'darwin' | 'win32' | 'linux' | 'other';
  arch: string;
  /** Names (never values) of credential-override variables in Profile Switcher's own environment. */
  credentialOverrideVariables: string[];
  /** Names of provider-selection variables (e.g. Bedrock/Vertex) in the environment. */
  providerOverrideVariables: string[];
  /** Terminal choices that apply to this OS. */
  terminals: TerminalId[];
}

export interface AppInfo {
  name: string;
  version: string;
  appId: string;
  electron: string;
  chrome: string;
  node: string;
}

export interface Snapshot {
  appInfo: AppInfo;
  environment: EnvironmentSummary;
  profiles: ProfileView[];
  apps: AppSummary[];
  settings: Settings;
  /** One-off notices, e.g. metadata recovered from a backup. */
  notices: Message[];
  /** True when the metadata file was written by a newer version; writes are refused. */
  readOnly: boolean;
  lastLaunchedProfileId: string | null;
  /** Live instances per profile at the time of the snapshot. */
  runtime: RuntimeSnapshot;
}

/**
 * How a launched process is followed:
 * - `pid-file`: the launched shell records its own PID before exec'ing the
 *   application (macOS/Linux terminals), so the real process can be found.
 * - `child`: Profile Switcher started the application process directly and
 *   holds its handle (Windows console programs).
 * - `none`: the process cannot be followed reliably (e.g. macOS `open`).
 */
export type ProcessTracking = 'pid-file' | 'child' | 'none';

/**
 * Observed state of one launched instance. `running` is reported only when a
 * live process was found AND identified as the launched application; a
 * successful spawn alone never produces `running`.
 */
export type InstanceState = 'starting' | 'running' | 'unconfirmed' | 'untracked';

export interface InstanceStatus {
  launchId: string;
  pid: number | null;
  startedAt: string;
  state: InstanceState;
  /**
   * Whether the isolation variable (e.g. CLAUDE_CONFIG_DIR) was read back from
   * the running process and matched. Only possible where the OS exposes a
   * process's environment to its owner (Linux).
   */
  configDirectory: 'verified' | 'mismatch' | 'not-checked';
}

/** Live instances per profile ID. Exited instances are not listed. */
export type RuntimeSnapshot = Record<string, InstanceStatus[]>;

export interface LaunchReport {
  launchId: string;
  tracking: ProcessTracking;
  method: LaunchMethod;
  isolation: IsolationLevel;
  /** Terminal used, for terminal launches. */
  terminal: string | null;
  /** PID of the process Profile Switcher spawned (a terminal or the app), if known. */
  pid: number | null;
  notes: Message[];
}

export interface VerificationReport {
  verifiedAt: string;
  appVersion: string | null;
  expectedConfigDirectory: string;
  reportedConfigDirectory: string | null;
  configDirectoryMatches: boolean;
  /** Null when the application did not report sign-in state. */
  loggedIn: boolean | null;
  authMethod: string | null;
  /** Account details reported by the application. Shown transiently; never persisted. */
  account: { email: string | null; organization: string | null; subscription: string | null };
  strippedVariables: string[];
}

export interface DirectoryChoice {
  path: string;
  exists: boolean;
  isEmpty: boolean;
}

export interface DiagnosticsReport {
  generatedAt: string;
  text: string;
  paths: { metadataFile: string; profilesRoot: string; logsDirectory: string };
}

export interface DeleteResult {
  snapshot: Snapshot;
  /** Directory that was intentionally left on disk, if any. */
  retainedDirectory: string | null;
}

export interface LaunchResult {
  snapshot: Snapshot;
  report: LaunchReport;
}

export interface CreateResult {
  snapshot: Snapshot;
  profileId: string;
}

/** The API exposed to the renderer as `window.profileSwitcher`. */
export interface ProfileSwitcherApi {
  getSnapshot(): Promise<Result<Snapshot>>;
  refreshApps(): Promise<Result<Snapshot>>;
  createProfile(input: CreateProfileInput): Promise<Result<CreateResult>>;
  updateProfile(input: UpdateProfileInput): Promise<Result<Snapshot>>;
  deleteProfile(id: string): Promise<Result<DeleteResult>>;
  launchProfile(id: string): Promise<Result<LaunchResult>>;
  verifyProfile(id: string): Promise<Result<VerificationReport>>;
  openProfileDirectory(id: string): Promise<Result<null>>;
  copyLaunchCommand(id: string, shell: CommandShell): Promise<Result<{ command: string }>>;
  updateSettings(patch: SettingsPatch): Promise<Result<Snapshot>>;
  chooseDirectory(
    purpose: 'profile-data' | 'working-directory',
  ): Promise<Result<DirectoryChoice | null>>;
  getDiagnostics(): Promise<Result<DiagnosticsReport>>;
  copyDiagnostics(): Promise<Result<null>>;
  openLogsDirectory(): Promise<Result<null>>;
  openLink(id: LinkId): Promise<Result<null>>;
  getRuntime(): Promise<Result<RuntimeSnapshot>>;
}

export type { AppError, CommandShell, Result };
