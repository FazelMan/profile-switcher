import { promises as fs } from 'node:fs';
import { AppFailure } from '@shared/domain/errors';
import {
  isCleanAbsolutePath,
  isFilesystemRoot,
  isStrictlyInside,
  pathApiFor,
  pathsOverlap,
  samePath,
} from '../platform';
import type { SystemContext } from '../system';

export interface DirectoryPolicyInput {
  rawPath: string;
  allowNonEmpty: boolean;
  /** Directories owned by Profile Switcher (metadata, managed profiles, logs). */
  ownedRoots: readonly string[];
  /** Applications' own default data directories (e.g. ~/.claude). */
  reserved: readonly string[];
  /** Directories already used by other profiles. */
  otherProfileDirectories: readonly string[];
  system: SystemContext;
}

export interface DirectoryPolicyResult {
  path: string;
  exists: boolean;
}

async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
}

function checkPlacement(candidate: string, input: DirectoryPolicyInput): void {
  const { platform, homeDir } = input.system;
  if (isFilesystemRoot(candidate, platform))
    throw new AppFailure('DIRECTORY_RESERVED', { reason: 'root' });
  // The home directory and anything above it would contain every other
  // profile and the user's own files.
  if (samePath(candidate, homeDir, platform) || isStrictlyInside(homeDir, candidate, platform)) {
    throw new AppFailure('DIRECTORY_RESERVED', { reason: 'home' });
  }
  if (input.ownedRoots.some((root) => pathsOverlap(candidate, root, platform))) {
    throw new AppFailure('DIRECTORY_RESERVED', { reason: 'profile-switcher' });
  }
  if (input.reserved.some((dir) => pathsOverlap(candidate, dir, platform))) {
    throw new AppFailure('DIRECTORY_RESERVED', { reason: 'application-default' });
  }
  if (input.otherProfileDirectories.some((dir) => pathsOverlap(candidate, dir, platform))) {
    throw new AppFailure('DIRECTORY_OVERLAPS_PROFILE');
  }
}

/**
 * Validates (and if needed creates) a user-chosen profile directory.
 *
 * - Must be a clean absolute path (no relative segments, no UNC on Windows).
 * - Must not be a filesystem root, the home directory or one of its
 *   ancestors, a Profile Switcher directory, an application's default data
 *   directory, or overlap another profile's directory. Symlinks are resolved
 *   so a link cannot smuggle in a reserved target.
 * - An existing non-empty directory requires explicit user approval.
 *   Profile Switcher never deletes or rewrites its contents either way.
 */
export async function validateCustomDirectory(
  input: DirectoryPolicyInput,
): Promise<DirectoryPolicyResult> {
  const { system } = input;
  const p = pathApiFor(system.platform);
  if (!isCleanAbsolutePath(input.rawPath, system.platform))
    throw new AppFailure('DIRECTORY_NOT_ABSOLUTE');
  const candidate = p.resolve(input.rawPath);
  checkPlacement(candidate, input);

  const stat = await system.files.stat(candidate);
  if (stat) {
    if (!stat.isDirectory) throw new AppFailure('DIRECTORY_IS_FILE');
    const real = await realpathOrNull(candidate);
    if (real && !samePath(real, candidate, system.platform)) checkPlacement(real, input);
    const empty = await system.files.isEmptyDirectory(candidate);
    if (empty === null) throw new AppFailure('DIRECTORY_NOT_WRITABLE');
    if (!empty && !input.allowNonEmpty) throw new AppFailure('DIRECTORY_NOT_EMPTY');
    if (!(await system.files.isWritable(candidate))) throw new AppFailure('DIRECTORY_NOT_WRITABLE');
    return { path: candidate, exists: true };
  }

  // Resolve the nearest existing ancestor through symlinks as well.
  let ancestor = p.dirname(candidate);
  while (!(await system.files.stat(ancestor)) && p.dirname(ancestor) !== ancestor)
    ancestor = p.dirname(ancestor);
  const realAncestor = await realpathOrNull(ancestor);
  if (realAncestor && !samePath(realAncestor, ancestor, system.platform)) {
    checkPlacement(p.join(realAncestor, p.relative(ancestor, candidate)), input);
  }
  return { path: candidate, exists: false };
}

export async function validateWorkingDirectory(
  rawPath: string,
  system: SystemContext,
): Promise<string> {
  if (!isCleanAbsolutePath(rawPath, system.platform))
    throw new AppFailure('WORKING_DIRECTORY_INVALID');
  const resolved = pathApiFor(system.platform).resolve(rawPath);
  const stat = await system.files.stat(resolved);
  if (!stat?.isDirectory) throw new AppFailure('WORKING_DIRECTORY_INVALID');
  return resolved;
}

/**
 * Creates a profile directory owner-only. Returns the first directory that
 * was newly created (for rollback), or null if it already existed.
 */
export async function createPrivateDirectory(dir: string): Promise<string | null> {
  try {
    const created = await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    return created ?? null;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    throw new AppFailure(
      'DIRECTORY_CREATE_FAILED',
      undefined,
      `mkdir failed: ${typeof code === 'string' ? code : 'unknown'}`,
    );
  }
}

/**
 * Rolls back directories this process just created when saving the profile
 * failed. Uses non-recursive `rmdir`, so a directory that somehow gained
 * content is left alone.
 */
export async function rollbackCreatedDirectories(
  leaf: string,
  firstCreated: string,
): Promise<void> {
  const p = pathApiFor(process.platform);
  let current = leaf;
  for (;;) {
    try {
      await fs.rmdir(current);
    } catch {
      return;
    }
    if (samePath(current, firstCreated, process.platform)) return;
    const parent = p.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
