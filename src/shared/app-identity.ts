/**
 * Single source of truth for application identifiers. Packaging
 * (electron-builder.yml) and the main process both read these values; do not
 * hard-code them elsewhere.
 */
export const APP_IDENTITY = {
  appId: 'com.profileswitcher.app',
  productName: 'Profile Switcher',
  /** Lower-case, filesystem-friendly name used for XDG directories on Linux. */
  slug: 'profile-switcher',
  repositoryUrl: 'https://github.com/FazelMan/profile-switcher',
} as const;

/**
 * Environment variable that relocates every Profile Switcher directory under a
 * single root. Intended for portable setups, automated tests, and development.
 */
export const DATA_DIR_OVERRIDE_ENV = 'PROFILE_SWITCHER_DATA_DIR';
