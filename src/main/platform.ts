import path from 'node:path';

export type SupportedPlatform = 'darwin' | 'win32' | 'linux';

export function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return platform === 'darwin' || platform === 'win32' || platform === 'linux';
}

/** Path API matching the target platform, so logic is testable on any host OS. */
export function pathApiFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

/**
 * Default macOS (APFS/HFS+) and Windows (NTFS) volumes are case-insensitive,
 * so path comparisons there must be too. Linux filesystems are case-sensitive.
 */
export function isCaseInsensitive(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin';
}

function comparable(p: string, platform: NodeJS.Platform): string {
  const api = pathApiFor(platform);
  let normalized = api.resolve(p);
  // Strip a trailing separator except for a filesystem root.
  if (normalized.length > api.parse(normalized).root.length) {
    normalized = normalized.replace(/[\\/]+$/, '');
  }
  return isCaseInsensitive(platform) ? normalized.toLowerCase() : normalized;
}

export function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  return comparable(a, platform) === comparable(b, platform);
}

/** True when `child` is strictly inside `parent`. */
export function isStrictlyInside(
  child: string,
  parent: string,
  platform: NodeJS.Platform,
): boolean {
  const api = pathApiFor(platform);
  const c = comparable(child, platform);
  const p = comparable(parent, platform);
  if (c === p) return false;
  const prefix = p.endsWith(api.sep) ? p : p + api.sep;
  return c.startsWith(prefix);
}

/** True when the two paths are equal or one contains the other. */
export function pathsOverlap(a: string, b: string, platform: NodeJS.Platform): boolean {
  return (
    samePath(a, b, platform) || isStrictlyInside(a, b, platform) || isStrictlyInside(b, a, platform)
  );
}

export function isFilesystemRoot(p: string, platform: NodeJS.Platform): boolean {
  const api = pathApiFor(platform);
  const resolved = api.resolve(p);
  return api.parse(resolved).root.toLowerCase() === resolved.toLowerCase();
}

/**
 * Accepts only absolute paths that are already in canonical form apart from
 * trailing separators. Relative paths and `..` segments are rejected rather
 * than silently resolved against the main process's working directory.
 */
export function isCleanAbsolutePath(p: string, platform: NodeJS.Platform): boolean {
  const api = pathApiFor(platform);
  if (!api.isAbsolute(p)) return false;
  if (platform === 'win32') {
    // Require a drive-letter path. UNC and device paths (\\server, \\?\) are
    // refused: they can reach network shares or bypass normal path parsing.
    if (!/^[A-Za-z]:[\\/]/.test(p)) return false;
  }
  const segments = p.split(/[\\/]+/);
  return !segments.some((segment) => segment === '..' || segment === '.');
}
