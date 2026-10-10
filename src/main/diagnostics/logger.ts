import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Redactor } from './redact';

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
  /** Resolves when queued writes have been flushed. */
  flush(): Promise<void>;
}

export const LOG_FILE_NAME = 'profile-switcher.log';
const MAX_LOG_BYTES = 1024 * 1024;

/**
 * Local, append-only JSON-lines logger. Every record passes through the
 * redactor. There is no remote transport. Environment variables are never
 * logged wholesale; callers log variable names only.
 */
export function createFileLogger(options: {
  directory: string;
  redactor: Redactor;
  echo?: boolean;
}): Logger {
  const filePath = path.join(options.directory, LOG_FILE_NAME);
  let queue: Promise<void> = (async () => {
    await fs.mkdir(options.directory, { recursive: true, mode: 0o700 });
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && stat.size > MAX_LOG_BYTES) {
      await fs.rename(filePath, `${filePath}.1`).catch(() => undefined);
    }
  })().catch(() => undefined);

  const write = (level: LogLevel, event: string, data?: Record<string, unknown>): void => {
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...(data ? { data: options.redactor.value(data) } : {}),
    };
    const line = `${JSON.stringify(record)}\n`;
    if (options.echo && level !== 'info') console.warn(line.trimEnd());
    queue = queue
      .then(() => fs.appendFile(filePath, line, { encoding: 'utf8', mode: 0o600 }))
      .catch(() => undefined);
  };

  return {
    info: (event, data) => write('info', event, data),
    warn: (event, data) => write('warn', event, data),
    error: (event, data) => write('error', event, data),
    flush: () => queue,
  };
}

/** Logger that discards records; used by tests. */
export function createNullLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    flush: async () => undefined,
  };
}
