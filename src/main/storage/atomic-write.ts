import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Writes `data` to `filePath` so readers only ever observe the old or the new
 * content: write a sibling temp file, fsync it, then rename it over the
 * target. On Windows, antivirus or indexer handles can transiently block the
 * rename, so it is retried briefly.
 */
export async function writeFileAtomic(
  filePath: string,
  data: string,
  options: { mode?: number } = {},
): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  const mode = options.mode ?? 0o600;

  const handle = await fs.open(tempPath, 'wx', mode);
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(tempPath, filePath);
        break;
      } catch (error) {
        if (
          process.platform === 'win32' &&
          attempt < 5 &&
          RETRYABLE_RENAME_CODES.has(errorCode(error) ?? '')
        ) {
          await delay(25 * 2 ** attempt);
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  // Persist the directory entry for the rename where the OS supports it.
  if (process.platform !== 'win32') {
    const dirHandle = await fs.open(dir, 'r').catch(() => null);
    if (dirHandle) {
      await dirHandle.sync().catch(() => undefined);
      await dirHandle.close();
    }
  }
}

export { errorCode };
