import { z } from 'zod';
import { appIdSchema } from './profile';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Locales with a complete catalog. Add a locale here once it is translated. */
export const LANGUAGES = ['en', 'fa'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Languages written right to left. */
export const RTL_LANGUAGES: readonly Language[] = ['fa'];

/**
 * What launching a profile does when other profiles of the same application
 * are already running:
 * - `concurrent`: start it alongside them. Nothing else is touched.
 * - `switch`: offer to close the other profiles first. They are closed only
 *   after the user confirms, and only by asking them to quit normally.
 */
export const LAUNCH_MODES = ['concurrent', 'switch'] as const;
export type LaunchMode = (typeof LAUNCH_MODES)[number];
export const DEFAULT_LAUNCH_MODE: LaunchMode = 'concurrent';

/**
 * Features that rely on undocumented application behavior. They are off by
 * default and the UI explains the risks before they can be turned on.
 */
export const experimentalSettingsSchema = z
  .object({
    /** Separate Claude Desktop profiles through Chromium's --user-data-dir option. */
    claudeDesktopIsolation: z.boolean(),
  })
  .strict();
export type ExperimentalSettings = z.infer<typeof experimentalSettingsSchema>;
export type ExperimentalFeature = keyof ExperimentalSettings;

/**
 * What the primary action does for command-line integrations such as
 * Claude Code: open a new terminal window, or copy the launch command so the
 * user can paste it into a terminal of their choice.
 */
export const CLI_LAUNCH_BEHAVIORS = ['open-terminal', 'copy-command'] as const;
export type CliLaunchBehavior = (typeof CLI_LAUNCH_BEHAVIORS)[number];

/** Terminal identifiers. `auto` picks the first available for the platform. */
export const TERMINAL_IDS = [
  'auto',
  // macOS
  'macos-terminal',
  'iterm',
  // Linux
  'x-terminal-emulator',
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'kitty',
  'alacritty',
  'wezterm',
  'foot',
  'xterm',
  // Windows
  'windows-console',
] as const;
export type TerminalId = (typeof TERMINAL_IDS)[number];

/**
 * Which browser opens sign-in pages for applications that support it:
 * `auto` uses the OS default browser (or another supported one) with a
 * separate browser profile per Profile Switcher profile; `off` leaves the
 * application's normal behavior (the shared default browser).
 */
export const SIGN_IN_BROWSER_CHOICES = [
  'auto',
  'off',
  'chrome',
  'edge',
  'brave',
  'chromium',
  'vivaldi',
  'firefox',
] as const;
export type SignInBrowserChoice = (typeof SIGN_IN_BROWSER_CHOICES)[number];

export const settingsSchema = z
  .object({
    theme: z.enum(THEMES),
    language: z.enum(LANGUAGES),
    cliLaunchBehavior: z.enum(CLI_LAUNCH_BEHAVIORS),
    preferredTerminal: z.enum(TERMINAL_IDS),
    /** Per application ID. Applications without an entry use DEFAULT_LAUNCH_MODE. */
    launchModes: z
      .record(appIdSchema, z.enum(LAUNCH_MODES))
      .refine((modes) => Object.keys(modes).length <= 32, 'Too many launch modes'),
    experimental: experimentalSettingsSchema,
    signInBrowser: z.enum(SIGN_IN_BROWSER_CHOICES),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'en',
  cliLaunchBehavior: 'open-terminal',
  preferredTerminal: 'auto',
  launchModes: {},
  experimental: { claudeDesktopIsolation: false },
  signInBrowser: 'auto',
};

export function launchModeFor(settings: Settings, appId: string): LaunchMode {
  return Object.hasOwn(settings.launchModes, appId)
    ? (settings.launchModes[appId] ?? DEFAULT_LAUNCH_MODE)
    : DEFAULT_LAUNCH_MODE;
}

/**
 * `launchModes` entries are merged into the stored map; every other field
 * replaces the stored value.
 */
export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
