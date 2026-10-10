import { isCleanAbsolutePath, pathApiFor } from '../platform';
import type { SystemContext } from '../system';

export interface ExecutableMatch {
  path: string;
  source: 'path' | 'known-location';
}

/** Extensions considered when searching PATH on Windows. */
const WINDOWS_EXTENSIONS = ['.exe', '.cmd'];

function envValue(system: SystemContext, name: string): string | undefined {
  if (system.platform !== 'win32') return system.env[name];
  const key = Object.keys(system.env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? system.env[key] : undefined;
}

/**
 * Absolute PATH directories only. Relative entries (including an empty entry,
 * which some shells treat as the current directory) are skipped so a
 * malicious `claude` in whatever directory Profile Switcher happens to run
 * from can never be picked up.
 */
export function searchPathDirectories(system: SystemContext): string[] {
  const raw = envValue(system, 'PATH') ?? '';
  const delimiter = system.platform === 'win32' ? ';' : ':';
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const entry of raw.split(delimiter)) {
    const trimmed = entry.trim().replace(/^"(.*)"$/, '$1');
    if (!trimmed || !isCleanAbsolutePath(trimmed, system.platform)) continue;
    const key = system.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    dirs.push(trimmed);
  }
  return dirs;
}

async function isUsableExecutable(system: SystemContext, candidate: string): Promise<boolean> {
  const stat = await system.files.stat(candidate);
  if (!stat?.isFile) return false;
  if (system.platform === 'win32') {
    return WINDOWS_EXTENSIONS.some((ext) => candidate.toLowerCase().endsWith(ext));
  }
  return system.files.isExecutable(candidate);
}

/**
 * Finds an executable by searching PATH first (respecting the user's own
 * ordering) and then well-known install locations, which matters for GUI
 * apps on macOS that start with a minimal PATH.
 */
export async function findExecutable(
  system: SystemContext,
  baseName: string,
  knownLocations: readonly string[],
): Promise<ExecutableMatch | null> {
  const p = pathApiFor(system.platform);
  const names =
    system.platform === 'win32' ? WINDOWS_EXTENSIONS.map((ext) => baseName + ext) : [baseName];

  for (const dir of searchPathDirectories(system)) {
    for (const name of names) {
      const candidate = p.join(dir, name);
      if (await isUsableExecutable(system, candidate)) return { path: candidate, source: 'path' };
    }
  }
  for (const candidate of knownLocations) {
    if (!isCleanAbsolutePath(candidate, system.platform)) continue;
    if (await isUsableExecutable(system, candidate))
      return { path: candidate, source: 'known-location' };
  }
  return null;
}

/** Extracts the first semantic version (x.y.z) from tool output. */
export function parseVersion(output: string): string | null {
  const match = /(?<![\d.])(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)/.exec(output);
  return match?.[1] ?? null;
}

export function systemEnv(system: SystemContext, name: string): string | undefined {
  return envValue(system, name);
}

export function windowsComspec(system: SystemContext): string {
  const root = envValue(system, 'SystemRoot') ?? 'C:\\Windows';
  const p = pathApiFor('win32');
  return isCleanAbsolutePath(root, 'win32')
    ? p.join(root, 'System32', 'cmd.exe')
    : 'C:\\Windows\\System32\\cmd.exe';
}
