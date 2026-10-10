import type { Message } from './messages';
import type { IsolationLevel, StorageKind } from './profile';

/**
 * Integration status for a profile on the current machine. Computed by the
 * application adapter from real detection results; never hard-coded in UI.
 *
 * - Supported: the adapter's isolation mechanism is documented by the vendor
 *   and the application was found. (For `app-default` storage this means the
 *   ordinary launch works; the report's `isolation` is then `shared`.)
 * - Unsupported: no safe, documented isolation mechanism exists for this
 *   application/OS. A shared launch may still be offered, clearly labeled.
 * - NeedsVerification: the mechanism exists, but something on this machine
 *   (unknown version, credential override variables) means isolation cannot
 *   be assumed until the user verifies it.
 * - ApplicationNotFound: the application was not detected.
 * - ConfigurationError: the profile's own configuration is invalid
 *   (missing directory, unknown application, bad working directory).
 */
export const COMPATIBILITY_STATES = [
  'Supported',
  'Unsupported',
  'NeedsVerification',
  'ApplicationNotFound',
  'ConfigurationError',
] as const;
export type CompatibilityState = (typeof COMPATIBILITY_STATES)[number];

export interface CompatibilityReport {
  state: CompatibilityState;
  /** What a launch would provide right now, if available. */
  launch: { available: boolean; isolation: IsolationLevel };
  summary: Message;
  /** What is guaranteed for this profile. */
  guarantees: Message[];
  /** What is explicitly NOT guaranteed. */
  limitations: Message[];
  /** Safe next steps for the user. */
  guidance: Message[];
}

export type DetectionStatus = 'found' | 'not-found' | 'unsupported-platform';

export interface DetectionResult {
  status: DetectionStatus;
  /** Absolute path of the executable or app bundle, when found. */
  executablePath: string | null;
  /** Parsed version string, when it could be determined. */
  version: string | null;
  /** Where the executable was found. */
  source: 'path' | 'known-location' | null;
  checkedAt: string;
}

export type AppKind = 'cli' | 'desktop';

export const COMMAND_SHELLS = ['posix', 'fish', 'powershell', 'cmd'] as const;
export type CommandShell = (typeof COMMAND_SHELLS)[number];

/** Static adapter capabilities plus the latest detection result. */
export interface AppSummary {
  id: string;
  displayName: string;
  kind: AppKind;
  platformSupported: boolean;
  /** Storage kinds this adapter accepts for new profiles. */
  storageKinds: StorageKind[];
  /** Default storage kind proposed when creating a profile. */
  defaultStorageKind: StorageKind;
  /** Whether the adapter has a vendor-documented isolation mechanism. */
  isolationDocumented: boolean;
  mechanism: Message;
  supportsWorkingDirectory: boolean;
  supportsVerification: boolean;
  supportsCopyCommand: boolean;
  /** Shells the copy-command feature can target on this OS. */
  copyCommandShells: CommandShell[];
  detection: DetectionResult;
}
