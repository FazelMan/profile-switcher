import { quotePosix } from './launch/quoting';
import { isCleanAbsolutePath, pathApiFor } from './platform';
import type { SystemContext } from './system';
import { findExecutable } from './adapters/detection';

/**
 * Separate browser profiles for signing in.
 *
 * Claude Code signs in through the browser, and the sign-in page approves
 * whichever claude.ai account that browser is signed in to. If every profile
 * uses the same browser profile, signing a second profile in to a different
 * account means signing out of the first account in the browser.
 *
 * Profile Switcher therefore gives each profile its own browser profile (a
 * separate data folder for the user's browser) and points the conventional
 * `BROWSER` variable (which Claude Code reads to open links, per its source)
 * at a small per-profile opener, so links the
 * application opens — including its sign-in page — open in that profile's own
 * browser window. Profile Switcher never reads the browser folder.
 *
 * Supported: Chromium-based browsers (`--user-data-dir`, a documented
 * Chromium switch) and Firefox (`-profile <dir>`) on macOS and
 * Linux. Safari cannot be started with a separate profile from the command
 * line; Windows applications do not run a command file given in BROWSER.
 */

export type BrowserFamily = 'chromium' | 'firefox';

export interface BrowserCandidate {
  id: string;
  name: string;
  family: BrowserFamily;
  /** macOS bundle identifier (lower case). */
  bundleId: string;
  /** macOS application name in /Applications. */
  macApp: string;
  /** Linux executable names, most specific first. */
  linuxExecutables: string[];
  /** Linux .desktop file names. */
  linuxDesktop: string[];
}

export const BROWSERS: readonly BrowserCandidate[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    family: 'chromium',
    bundleId: 'com.google.chrome',
    macApp: 'Google Chrome.app',
    linuxExecutables: ['google-chrome-stable', 'google-chrome'],
    linuxDesktop: ['google-chrome.desktop'],
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    family: 'chromium',
    bundleId: 'com.microsoft.edgemac',
    macApp: 'Microsoft Edge.app',
    linuxExecutables: ['microsoft-edge-stable', 'microsoft-edge'],
    linuxDesktop: ['microsoft-edge.desktop'],
  },
  {
    id: 'brave',
    name: 'Brave',
    family: 'chromium',
    bundleId: 'com.brave.browser',
    macApp: 'Brave Browser.app',
    linuxExecutables: ['brave-browser', 'brave'],
    linuxDesktop: ['brave-browser.desktop'],
  },
  {
    id: 'chromium',
    name: 'Chromium',
    family: 'chromium',
    bundleId: 'org.chromium.chromium',
    macApp: 'Chromium.app',
    linuxExecutables: ['chromium', 'chromium-browser'],
    linuxDesktop: ['chromium.desktop', 'chromium-browser.desktop'],
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    family: 'chromium',
    bundleId: 'com.vivaldi.vivaldi',
    macApp: 'Vivaldi.app',
    linuxExecutables: ['vivaldi-stable', 'vivaldi'],
    linuxDesktop: ['vivaldi-stable.desktop'],
  },
  {
    id: 'firefox',
    name: 'Firefox',
    family: 'firefox',
    bundleId: 'org.mozilla.firefox',
    macApp: 'Firefox.app',
    linuxExecutables: ['firefox'],
    linuxDesktop: ['firefox.desktop', 'firefox-esr.desktop'],
  },
];

export const BROWSER_IDS = BROWSERS.map((b) => b.id);

export interface InstalledBrowser {
  id: string;
  name: string;
  family: BrowserFamily;
  /** App bundle (macOS) or executable (Linux). */
  path: string;
}

/** Supported browsers found on this computer, in BROWSERS order. */
export async function detectBrowsers(system: SystemContext): Promise<InstalledBrowser[]> {
  const found: InstalledBrowser[] = [];
  if (system.platform === 'darwin') {
    const p = pathApiFor('darwin');
    for (const browser of BROWSERS) {
      for (const dir of ['/Applications', p.join(system.homeDir, 'Applications')]) {
        const bundle = p.join(dir, browser.macApp);
        if ((await system.files.stat(bundle))?.isDirectory) {
          found.push({ id: browser.id, name: browser.name, family: browser.family, path: bundle });
          break;
        }
      }
    }
  } else if (system.platform === 'linux') {
    for (const browser of BROWSERS) {
      for (const exe of browser.linuxExecutables) {
        const match = await findExecutable(system, exe, []);
        if (match) {
          found.push({
            id: browser.id,
            name: browser.name,
            family: browser.family,
            path: match.path,
          });
          break;
        }
      }
    }
  }
  return found;
}

/** Reads the https handler bundle ID from macOS LaunchServices (`plutil` JSON). */
export function parseMacDefaultBrowser(json: string): string | null {
  try {
    const data = JSON.parse(json) as { LSHandlers?: Array<Record<string, unknown>> };
    const handler = (data.LSHandlers ?? []).find(
      (h) => h.LSHandlerURLScheme === 'https' || h.LSHandlerURLScheme === 'http',
    );
    const role = handler?.LSHandlerRoleAll;
    return typeof role === 'string' ? role.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The supported browser that is the OS default, or null (unsupported default or unknown). */
export async function defaultBrowserId(system: SystemContext): Promise<string | null> {
  if (system.platform === 'darwin') {
    const plist = pathApiFor('darwin').join(
      system.homeDir,
      'Library',
      'Preferences',
      'com.apple.LaunchServices',
      'com.apple.launchservices.secure.plist',
    );
    const result = await system.runner.run(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', plist],
      { env: {}, timeoutMs: 5000, maxOutputBytes: 1024 * 1024 },
    );
    if (result.exitCode !== 0) return null;
    const bundleId = parseMacDefaultBrowser(result.stdout);
    return BROWSERS.find((b) => b.bundleId === bundleId)?.id ?? null;
  }
  if (system.platform === 'linux') {
    const match = await findExecutable(system, 'xdg-settings', []);
    if (!match) return null;
    const result = await system.runner.run(match.path, ['get', 'default-web-browser'], {
      env: { PATH: '/usr/bin:/bin', HOME: system.homeDir },
      timeoutMs: 5000,
      maxOutputBytes: 4096,
    });
    const desktop = result.stdout.trim();
    return BROWSERS.find((b) => b.linuxDesktop.includes(desktop))?.id ?? null;
  }
  return null;
}

/**
 * The browser to use for a setting value: a specific browser if installed;
 * for `auto`, the OS default if supported, otherwise the first installed
 * supported browser.
 */
export function chooseBrowser(
  setting: string,
  installed: readonly InstalledBrowser[],
  defaultId: string | null,
): InstalledBrowser | null {
  if (setting === 'off') return null;
  if (setting !== 'auto') return installed.find((b) => b.id === setting) ?? null;
  return installed.find((b) => b.id === defaultId) ?? installed[0] ?? null;
}

/**
 * A POSIX shell script that opens its first argument in `browser` with the
 * given profile folder. Every value is single-quoted; the URL arrives as "$1"
 * and is never interpolated.
 */
export function buildBrowserOpener(
  browser: InstalledBrowser,
  profileDir: string,
  platform: NodeJS.Platform,
): string {
  if (!isCleanAbsolutePath(profileDir, platform) || !isCleanAbsolutePath(browser.path, platform)) {
    throw new Error('browser opener paths must be absolute');
  }
  const profileArgs =
    browser.family === 'chromium'
      ? [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check']
      : ['-profile', profileDir];
  const command =
    platform === 'darwin'
      ? ['/usr/bin/open', '-na', browser.path, '--args', ...profileArgs]
      : [browser.path, ...profileArgs];
  return [
    '#!/bin/sh',
    "# Generated by Profile Switcher: opens a link in this profile's own browser profile.",
    `exec ${command.map(quotePosix).join(' ')} "$1"`,
    '',
  ].join('\n');
}
