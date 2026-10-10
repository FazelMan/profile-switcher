import { describe, expect, it } from 'vitest';
import { ownedRoots, resolveAppPaths } from '../../src/main/paths';
import {
  isCleanAbsolutePath,
  isFilesystemRoot,
  isStrictlyInside,
  pathsOverlap,
  samePath,
} from '../../src/main/platform';

describe('resolveAppPaths', () => {
  it('uses Application Support and Library/Logs on macOS', () => {
    const paths = resolveAppPaths({ platform: 'darwin', homeDir: '/Users/ana', env: {} });
    expect(paths.metadataFile).toBe(
      '/Users/ana/Library/Application Support/Profile Switcher/metadata.json',
    );
    expect(paths.profilesRoot).toBe(
      '/Users/ana/Library/Application Support/Profile Switcher/profiles',
    );
    expect(paths.logsDir).toBe('/Users/ana/Library/Logs/Profile Switcher');
    expect(paths.overrideRoot).toBeNull();
  });

  it('keeps profile data in non-roaming LocalAppData on Windows', () => {
    const paths = resolveAppPaths({
      platform: 'win32',
      homeDir: 'C:\\Users\\Ana Lucía',
      env: {
        APPDATA: 'C:\\Users\\Ana Lucía\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\Ana Lucía\\AppData\\Local',
      },
    });
    expect(paths.metadataFile).toBe(
      'C:\\Users\\Ana Lucía\\AppData\\Roaming\\Profile Switcher\\metadata.json',
    );
    expect(paths.profilesRoot).toBe(
      'C:\\Users\\Ana Lucía\\AppData\\Local\\Profile Switcher\\profiles',
    );
    expect(paths.logsDir).toBe('C:\\Users\\Ana Lucía\\AppData\\Local\\Profile Switcher\\logs');
  });

  it('falls back to AppData under the profile when Windows variables are missing or relative', () => {
    const paths = resolveAppPaths({
      platform: 'win32',
      homeDir: 'C:\\Users\\bo',
      env: { LOCALAPPDATA: 'relative\\dir' },
    });
    expect(paths.metadataDir).toBe('C:\\Users\\bo\\AppData\\Roaming\\Profile Switcher');
    expect(paths.profilesRoot).toBe('C:\\Users\\bo\\AppData\\Local\\Profile Switcher\\profiles');
  });

  it('follows the XDG base directory spec on Linux', () => {
    const defaults = resolveAppPaths({ platform: 'linux', homeDir: '/home/ana', env: {} });
    expect(defaults.metadataFile).toBe('/home/ana/.config/profile-switcher/metadata.json');
    expect(defaults.profilesRoot).toBe('/home/ana/.local/share/profile-switcher/profiles');
    expect(defaults.logsDir).toBe('/home/ana/.local/state/profile-switcher/logs');

    const custom = resolveAppPaths({
      platform: 'linux',
      homeDir: '/home/ana',
      env: { XDG_CONFIG_HOME: '/cfg', XDG_DATA_HOME: '/data', XDG_STATE_HOME: 'relative/ignored' },
    });
    expect(custom.metadataFile).toBe('/cfg/profile-switcher/metadata.json');
    expect(custom.profilesRoot).toBe('/data/profile-switcher/profiles');
    expect(custom.logsDir).toBe('/home/ana/.local/state/profile-switcher/logs');
  });

  it('relocates everything under PROFILE_SWITCHER_DATA_DIR only when it is absolute', () => {
    const paths = resolveAppPaths({
      platform: 'linux',
      homeDir: '/home/ana',
      env: { PROFILE_SWITCHER_DATA_DIR: '/tmp/ps' },
    });
    expect(paths.overrideRoot).toBe('/tmp/ps');
    expect(paths.metadataFile).toBe('/tmp/ps/metadata.json');
    expect(paths.profilesRoot).toBe('/tmp/ps/profiles');
    expect(paths.logsDir).toBe('/tmp/ps/logs');

    const ignored = resolveAppPaths({
      platform: 'linux',
      homeDir: '/home/ana',
      env: { PROFILE_SWITCHER_DATA_DIR: 'rel/../x' },
    });
    expect(ignored.overrideRoot).toBeNull();
    const traversal = resolveAppPaths({
      platform: 'linux',
      homeDir: '/home/ana',
      env: { PROFILE_SWITCHER_DATA_DIR: '/tmp/../etc' },
    });
    expect(traversal.overrideRoot).toBeNull();
  });

  it('lists every owned root for overlap checks', () => {
    const paths = resolveAppPaths({ platform: 'linux', homeDir: '/home/ana', env: {} });
    expect(ownedRoots(paths)).toEqual(
      expect.arrayContaining([
        paths.metadataDir,
        paths.profilesRoot,
        paths.logsDir,
        paths.launchersDir,
        paths.electronDataDir,
      ]),
    );
  });
});

describe('path comparison helpers', () => {
  it('compares case-insensitively on Windows and macOS only', () => {
    expect(samePath('C:\\Users\\A', 'c:\\users\\a\\', 'win32')).toBe(true);
    expect(samePath('/Users/A', '/users/a', 'darwin')).toBe(true);
    expect(samePath('/home/A', '/home/a', 'linux')).toBe(false);
  });

  it('detects containment without prefix false-positives', () => {
    expect(isStrictlyInside('/data/work/sub', '/data/work', 'linux')).toBe(true);
    expect(isStrictlyInside('/data/workshop', '/data/work', 'linux')).toBe(false);
    expect(isStrictlyInside('/data/work', '/data/work', 'linux')).toBe(false);
    expect(isStrictlyInside('C:\\A\\b', 'c:\\a', 'win32')).toBe(true);
  });

  it('treats equal, ancestor, and descendant paths as overlapping', () => {
    expect(pathsOverlap('/a/b', '/a/b/', 'linux')).toBe(true);
    expect(pathsOverlap('/a', '/a/b', 'linux')).toBe(true);
    expect(pathsOverlap('/a/b/c', '/a/b', 'linux')).toBe(true);
    expect(pathsOverlap('/a/b', '/a/c', 'linux')).toBe(false);
  });

  it('accepts only clean absolute paths', () => {
    expect(isCleanAbsolutePath('/home/ana/work', 'linux')).toBe(true);
    expect(isCleanAbsolutePath('/home/ana/../root', 'linux')).toBe(false);
    expect(isCleanAbsolutePath('/home/./ana', 'linux')).toBe(false);
    expect(isCleanAbsolutePath('relative/path', 'linux')).toBe(false);
    expect(isCleanAbsolutePath('C:\\Users\\Ana Lucía\\work', 'win32')).toBe(true);
    expect(isCleanAbsolutePath('C:\\Users\\..\\Windows', 'win32')).toBe(false);
    expect(isCleanAbsolutePath('\\\\server\\share\\x', 'win32')).toBe(false);
    expect(isCleanAbsolutePath('\\\\?\\C:\\x', 'win32')).toBe(false);
    expect(isCleanAbsolutePath('\\Users\\x', 'win32')).toBe(false);
  });

  it('recognizes filesystem roots', () => {
    expect(isFilesystemRoot('/', 'linux')).toBe(true);
    expect(isFilesystemRoot('C:\\', 'win32')).toBe(true);
    expect(isFilesystemRoot('/home', 'linux')).toBe(false);
  });
});
