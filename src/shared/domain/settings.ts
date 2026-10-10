import { z } from 'zod';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Locales with a complete catalog. Add a locale here once it is translated. */
export const LANGUAGES = ['en'] as const;
export type Language = (typeof LANGUAGES)[number];

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

export const settingsSchema = z
  .object({
    theme: z.enum(THEMES),
    language: z.enum(LANGUAGES),
    cliLaunchBehavior: z.enum(CLI_LAUNCH_BEHAVIORS),
    preferredTerminal: z.enum(TERMINAL_IDS),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'en',
  cliLaunchBehavior: 'open-terminal',
  preferredTerminal: 'auto',
};

export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
