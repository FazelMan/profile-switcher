import { APP_IDENTITY, DATA_DIR_OVERRIDE_ENV } from '@shared/app-identity';
import { isCleanAbsolutePath, pathApiFor } from './platform';

export interface PathEnvironment {
  platform: NodeJS.Platform;
  homeDir: string;
  env: Readonly<Record<string, string | undefined>>;
}

/**
 * Directory layout. Four categories are kept apart:
 *  1. Profile Switcher metadata (`metadataFile`)
 *  2. Per-profile configuration directories it manages (`profilesRoot`)
 *  3. Target application data, which stays wherever the application keeps it
 *  4. Logs and diagnostics (`logsDir`)
 */
export interface AppPaths {
  metadataDir: string;
  metadataFile: string;
  profilesRoot: string;
  launchersDir: string;
  logsDir: string;
  /** Chromium/Electron session data (caches, local storage). */
  electronDataDir: string;
  /** Records of launched instances (PID files). */
  runtimeDir: string;
  /** Set when PROFILE_SWITCHER_DATA_DIR relocated everything. */
  overrideRoot: string | null;
}

const METADATA_FILE_NAME = 'metadata.json';

function absoluteOr(
  value: string | undefined,
  fallback: string,
  platform: NodeJS.Platform,
): string {
  return value && isCleanAbsolutePath(value, platform) ? value : fallback;
}

export function resolveAppPaths({ platform, homeDir, env }: PathEnvironment): AppPaths {
  const p = pathApiFor(platform);
  const override = env[DATA_DIR_OVERRIDE_ENV];

  if (override && isCleanAbsolutePath(override, platform)) {
    const root = p.resolve(override);
    return {
      metadataDir: root,
      metadataFile: p.join(root, METADATA_FILE_NAME),
      profilesRoot: p.join(root, 'profiles'),
      launchersDir: p.join(root, 'launchers'),
      logsDir: p.join(root, 'logs'),
      electronDataDir: p.join(root, 'electron'),
      runtimeDir: p.join(root, 'run'),
      overrideRoot: root,
    };
  }

  const name = APP_IDENTITY.productName;

  if (platform === 'darwin') {
    const root = p.join(homeDir, 'Library', 'Application Support', name);
    return {
      metadataDir: root,
      metadataFile: p.join(root, METADATA_FILE_NAME),
      profilesRoot: p.join(root, 'profiles'),
      launchersDir: p.join(root, 'launchers'),
      logsDir: p.join(homeDir, 'Library', 'Logs', name),
      electronDataDir: p.join(root, 'Electron'),
      runtimeDir: p.join(root, 'run'),
      overrideRoot: null,
    };
  }

  if (platform === 'win32') {
    // Metadata may roam with the Windows profile; configuration directories
    // hold sign-in state and therefore stay in the non-roaming LocalAppData.
    const roaming = absoluteOr(env.APPDATA, p.join(homeDir, 'AppData', 'Roaming'), platform);
    const local = absoluteOr(env.LOCALAPPDATA, p.join(homeDir, 'AppData', 'Local'), platform);
    const metadataDir = p.join(roaming, name);
    const localRoot = p.join(local, name);
    return {
      metadataDir,
      metadataFile: p.join(metadataDir, METADATA_FILE_NAME),
      profilesRoot: p.join(localRoot, 'profiles'),
      launchersDir: p.join(localRoot, 'launchers'),
      logsDir: p.join(localRoot, 'logs'),
      electronDataDir: p.join(localRoot, 'electron'),
      runtimeDir: p.join(localRoot, 'run'),
      overrideRoot: null,
    };
  }

  // Linux and other Unix-like systems: XDG Base Directory specification.
  // Relative XDG values are invalid per the spec and are ignored.
  const configHome = absoluteOr(env.XDG_CONFIG_HOME, p.join(homeDir, '.config'), platform);
  const dataHome = absoluteOr(env.XDG_DATA_HOME, p.join(homeDir, '.local', 'share'), platform);
  const stateHome = absoluteOr(env.XDG_STATE_HOME, p.join(homeDir, '.local', 'state'), platform);
  const slug = APP_IDENTITY.slug;
  const metadataDir = p.join(configHome, slug);
  return {
    metadataDir,
    metadataFile: p.join(metadataDir, METADATA_FILE_NAME),
    profilesRoot: p.join(dataHome, slug, 'profiles'),
    launchersDir: p.join(dataHome, slug, 'launchers'),
    logsDir: p.join(stateHome, slug, 'logs'),
    electronDataDir: p.join(dataHome, slug, 'electron'),
    runtimeDir: p.join(stateHome, slug, 'run'),
    overrideRoot: null,
  };
}

/** Every directory Profile Switcher owns. Custom profile paths may not overlap these. */
export function ownedRoots(paths: AppPaths): string[] {
  return [
    paths.metadataDir,
    paths.profilesRoot,
    paths.launchersDir,
    paths.logsDir,
    paths.electronDataDir,
    paths.runtimeDir,
  ];
}
