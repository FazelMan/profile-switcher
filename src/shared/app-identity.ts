import identity from './app-identity.json';

/**
 * Single source of truth for application identifiers, shared by the main
 * process, the renderer, and packaging (electron-builder.config.cjs reads the
 * same JSON file). Do not hard-code these values elsewhere.
 */
export const APP_IDENTITY: {
  /** Reverse-DNS application identifier (macOS bundle ID, Windows AppUserModelID). */
  readonly appId: string;
  readonly productName: string;
  /** Lower-case, filesystem-friendly name used for XDG directories and artifact names. */
  readonly slug: string;
  readonly repositoryUrl: string;
} = Object.freeze(identity);

/**
 * Environment variable that relocates every Profile Switcher directory under a
 * single root. Intended for portable setups, automated tests, and development.
 */
export const DATA_DIR_OVERRIDE_ENV = 'PROFILE_SWITCHER_DATA_DIR';
