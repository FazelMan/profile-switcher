import type { Logger } from '../diagnostics/logger';
import type { CommandRunner, ProcessInspector } from '../system';

/**
 * Asks one process to quit the way the OS normally asks an application to
 * close. Resolves true when the request was delivered (not that the process
 * has exited).
 */
export type QuitRequester = (pid: number) => Promise<boolean>;

/**
 * The only code in Profile Switcher that asks another process to quit. It is
 * used solely by Switch mode, after the user confirmed which instances to
 * close, and only for instances the tracker has just re-identified as a
 * profile's launched application.
 *
 * - macOS/Linux: SIGTERM, which applications treat as a normal quit request
 *   (an Electron app quits as if its menu's Quit was chosen; Claude Code
 *   exits). Never forced.
 * - Windows: `taskkill /PID <pid>` WITHOUT /F, which posts a close message to
 *   the process's windows. Console programs (Claude Code) cannot be asked to
 *   close this way; Windows then reports an error and the process is left
 *   running. Never forced.
 */
export function createNodeQuitRequester(
  platform: NodeJS.Platform,
  runner: CommandRunner,
): QuitRequester {
  const validPid = (pid: number) => Number.isInteger(pid) && pid > 1 && pid !== process.pid;
  if (platform === 'win32') {
    return async (pid) => {
      if (!validPid(pid)) return false;
      const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
      const result = await runner.run(
        `${systemRoot}\\System32\\taskkill.exe`,
        ['/PID', String(pid)],
        { env: { SystemRoot: systemRoot }, timeoutMs: 10_000, maxOutputBytes: 16 * 1024 },
      );
      return result.exitCode === 0;
    };
  }
  return async (pid) => {
    if (!validPid(pid)) return false;
    try {
      process.kill(pid, 'SIGTERM');
      return true;
    } catch {
      return false;
    }
  };
}

export interface CloseOutcome {
  pid: number;
  /** The process is gone. */
  exited: boolean;
}

export interface ProcessCloserOptions {
  requestQuit: QuitRequester;
  processes: ProcessInspector;
  logger: Logger;
  /** How long to wait for a process to exit after asking it to quit. */
  timeoutMs?: number;
  pollMs?: number;
}

export class ProcessCloser {
  private readonly timeoutMs: number;
  private readonly pollMs: number;

  constructor(private readonly options: ProcessCloserOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.pollMs = options.pollMs ?? 200;
  }

  /**
   * Asks the process to quit and waits until it has exited or the timeout
   * passed. A process that does not exit in time is left running.
   */
  async close(pid: number): Promise<CloseOutcome> {
    const { processes, logger } = this.options;
    if (!processes.isAlive(pid)) return { pid, exited: true };
    const delivered = await this.options.requestQuit(pid);
    if (!delivered) {
      logger.warn('switch.quit-request-failed', { pid });
      return { pid, exited: !processes.isAlive(pid) };
    }
    const deadline = Date.now() + this.timeoutMs;
    while (processes.isAlive(pid)) {
      if (Date.now() >= deadline) {
        logger.warn('switch.quit-timeout', { pid });
        return { pid, exited: false };
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    return { pid, exited: true };
  }
}
