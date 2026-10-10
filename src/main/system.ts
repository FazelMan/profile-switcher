import { spawn, type SpawnOptions } from 'node:child_process';
import { constants as fsConstants, existsSync, promises as fs } from 'node:fs';
import os from 'node:os';

/**
 * Chromium opens many file descriptors without close-on-exec, and on Linux
 * libuv's fork/exec does not close them, so every process started from the
 * Electron main process would inherit Profile Switcher's IPC sockets, cache
 * files, and storage locks. On Linux, every spawn therefore goes through this
 * fixed bash script, which closes all descriptors above stderr and then execs
 * the real program with its argument vector unchanged. `-p` makes bash ignore
 * BASH_ENV and exported functions while still passing the environment on.
 *
 * macOS (posix_spawn with close-on-exec by default) and Windows (handles are
 * not inheritable by default) do not need this.
 */
export const LINUX_CLOSE_FDS_SCRIPT =
  'for p in /proc/$$/fd/*; do fd=${p##*/}; case $fd in ""|*[!0-9]*) continue;; esac; [ "$fd" -gt 2 ] && exec {fd}>&-; done; exec "$@"';
/** POSIX sh fallback for systems without bash: only descriptors 3-9 can be closed portably. */
export const POSIX_CLOSE_FDS_SCRIPT = 'exec 3>&- 4>&- 5>&- 6>&- 7>&- 8>&- 9>&-; exec "$@"';

let linuxCleanShell: { file: string; flags: string[]; script: string } | null = null;

function resolveCleanShell(): { file: string; flags: string[]; script: string } {
  if (!linuxCleanShell) {
    const bash = ['/bin/bash', '/usr/bin/bash'].find((candidate) => existsSync(candidate));
    linuxCleanShell = bash
      ? { file: bash, flags: ['-p', '-c'], script: LINUX_CLOSE_FDS_SCRIPT }
      : { file: '/bin/sh', flags: ['-c'], script: POSIX_CLOSE_FDS_SCRIPT };
  }
  return linuxCleanShell;
}

/** Wraps a Linux invocation so the started program inherits only stdin/stdout/stderr. */
export function withCleanDescriptors(
  platform: NodeJS.Platform,
  file: string,
  args: readonly string[],
): { file: string; args: string[] } {
  if (platform !== 'linux') return { file, args: [...args] };
  const shell = resolveCleanShell();
  return {
    file: shell.file,
    args: [...shell.flags, shell.script, 'profile-switcher-exec', file, ...args],
  };
}

/**
 * Narrow interfaces over the OS so adapters, the launcher, and the profile
 * service can be tested with fakes. Only the main process constructs the real
 * implementation.
 */
export interface FileProbe {
  stat(p: string): Promise<{ isFile: boolean; isDirectory: boolean } | null>;
  isExecutable(p: string): Promise<boolean>;
  isWritable(p: string): Promise<boolean>;
  /** Null when the directory cannot be read. */
  isEmptyDirectory(p: string): Promise<boolean | null>;
  /** Reads at most `maxBytes` of a UTF-8 text file; null when unreadable. */
  readTextFile(p: string, maxBytes: number): Promise<string | null>;
  /** Names of the entries in a directory; null when it cannot be read. */
  listDirectory(p: string): Promise<string[] | null>;
}

export interface RunOptions {
  env: Record<string, string>;
  cwd?: string;
  timeoutMs: number;
  maxOutputBytes?: number;
  windowsVerbatimArguments?: boolean;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface CommandRunner {
  run(file: string, args: readonly string[], options: RunOptions): Promise<RunResult>;
}

export interface SpawnDetachedOptions {
  env: Record<string, string>;
  cwd: string;
  windowsVerbatimArguments?: boolean;
  /** Called when the started process exits (only while Profile Switcher is running). */
  onExit?: (code: number | null) => void;
}

export interface ProcessSpawner {
  /**
   * Starts a detached process that outlives Profile Switcher. Resolves once
   * the OS reports the process started; rejects if it could not be started.
   * A resolved promise is NOT evidence that the application signed in or that
   * isolation took effect.
   */
  spawnDetached(
    file: string,
    args: readonly string[],
    options: SpawnDetachedOptions,
  ): Promise<{ pid: number | null }>;
}

/**
 * Read-only queries about running processes, used to confirm that a launched
 * instance is actually alive and is the expected application.
 */
export interface ProcessInspector {
  isAlive(pid: number): boolean;
  /** Command line (POSIX) or image name (Windows) of a process; null if unavailable. */
  commandLine(pid: number): Promise<string | null>;
  /**
   * The value of ONE named environment variable of a running process owned
   * by the current user. Returns `undefined` where the OS does not expose
   * process environments (macOS, Windows), `null` when the variable is not
   * set or the process cannot be read. Other variables are never returned.
   */
  environmentVariable(pid: number, name: string): Promise<string | null | undefined>;
  /**
   * PIDs of the current user's processes whose LAST argument is exactly
   * `marker`, excluding Chromium helper processes (any `--type=` argument).
   * Used to find a desktop application's main process when it was started
   * through a launcher (macOS `open`, a Windows launcher stub) whose own PID
   * is not the application's. Returns null when the process list cannot be
   * read on this OS.
   */
  findByFinalArgument(marker: string): Promise<number[] | null>;
}

/** Whether a command line, as one string, ends with `marker` as its own argument. */
export function commandLineEndsWithArgument(commandLine: string, marker: string): boolean {
  const text = commandLine.trimEnd();
  let rest: string;
  if (text.endsWith(` ${marker}`)) rest = text.slice(0, -(marker.length + 1));
  else if (text.endsWith(` "${marker}"`)) rest = text.slice(0, -(marker.length + 3));
  else return false;
  return !/(^|\s)"?--type=/.test(rest);
}

export interface SystemContext {
  platform: NodeJS.Platform;
  arch: string;
  homeDir: string;
  env: Readonly<Record<string, string | undefined>>;
  files: FileProbe;
  runner: CommandRunner;
  spawner: ProcessSpawner;
  processes: ProcessInspector;
}

export const nodeFileProbe: FileProbe = {
  async stat(p) {
    try {
      const s = await fs.stat(p);
      return { isFile: s.isFile(), isDirectory: s.isDirectory() };
    } catch {
      return null;
    }
  },
  async isExecutable(p) {
    try {
      await fs.access(p, fsConstants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  async isWritable(p) {
    try {
      await fs.access(p, fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
  async isEmptyDirectory(p) {
    try {
      const dir = await fs.opendir(p);
      try {
        return (await dir.read()) === null;
      } finally {
        await dir.close().catch(() => undefined);
      }
    } catch {
      return null;
    }
  },
  async readTextFile(p, maxBytes) {
    try {
      const handle = await fs.open(p, 'r');
      try {
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
        return buffer.subarray(0, bytesRead).toString('utf8');
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  },
  async listDirectory(p) {
    try {
      return await fs.readdir(p);
    } catch {
      return null;
    }
  },
};

export const nodeCommandRunner: CommandRunner = {
  run(file, args, options) {
    const maxBytes = options.maxOutputBytes ?? 256 * 1024;
    return new Promise((resolve) => {
      const spawnOptions: SpawnOptions = {
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
      };
      if (options.cwd) spawnOptions.cwd = options.cwd;
      let child;
      try {
        const call = withCleanDescriptors(process.platform, file, args);
        child = spawn(call.file, call.args, spawnOptions);
      } catch (error) {
        resolve({ exitCode: null, stdout: '', stderr: String(error), timedOut: false });
        return;
      }
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const append = (current: string, chunk: Buffer) =>
        current.length >= maxBytes
          ? current
          : (current + chunk.toString('utf8')).slice(0, maxBytes);
      child.stdout?.on('data', (chunk: Buffer) => (stdout = append(stdout, chunk)));
      child.stderr?.on('data', (chunk: Buffer) => (stderr = append(stderr, chunk)));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ exitCode: null, stdout, stderr: stderr || error.message, timedOut });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr, timedOut });
      });
    });
  },
};

export const nodeProcessSpawner: ProcessSpawner = {
  spawnDetached(file, args, options) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        const call = withCleanDescriptors(process.platform, file, args);
        child = spawn(call.file, call.args, {
          env: options.env,
          cwd: options.cwd,
          detached: true,
          stdio: 'ignore',
          shell: false,
          // On Windows a detached console program gets its own console
          // window, which is how CLI tools are shown to the user.
          windowsHide: false,
          windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      child.once('error', reject);
      child.once('spawn', () => {
        child.removeListener('error', reject);
        child.on('error', () => undefined);
        if (options.onExit) child.once('exit', (code) => options.onExit?.(code));
        child.unref();
        resolve({ pid: child.pid ?? null });
      });
    });
  },
};

export function createNodeProcessInspector(
  platform: NodeJS.Platform,
  runner: CommandRunner,
): ProcessInspector {
  const validPid = (pid: number) => Number.isInteger(pid) && pid > 0;
  return {
    isAlive(pid) {
      if (!validPid(pid)) return false;
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        // EPERM: the process exists but belongs to someone else.
        return (error as { code?: string }).code === 'EPERM';
      }
    },
    async commandLine(pid) {
      if (!validPid(pid)) return null;
      if (platform === 'linux') {
        const raw = await fs.readFile(`/proc/${pid}/cmdline`).catch(() => null);
        return raw && raw.length > 0
          ? raw.toString('utf8').replace(/\0+$/, '').split('\0').join(' ')
          : null;
      }
      if (platform === 'darwin') {
        const result = await runner.run('/bin/ps', ['-p', String(pid), '-o', 'command='], {
          env: {},
          timeoutMs: 5000,
          maxOutputBytes: 16 * 1024,
        });
        return result.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : null;
      }
      if (platform === 'win32') {
        const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
        const result = await runner.run(
          `${systemRoot}\\System32\\tasklist.exe`,
          ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
          {
            env: { SystemRoot: systemRoot },
            timeoutMs: 5000,
            maxOutputBytes: 16 * 1024,
          },
        );
        const match = /^"([^"]+)","(\d+)"/m.exec(result.stdout);
        return match && Number(match[2]) === pid ? (match[1] ?? null) : null;
      }
      return null;
    },
    async environmentVariable(pid, name) {
      if (platform !== 'linux') return undefined;
      if (!validPid(pid)) return null;
      const raw = await fs.readFile(`/proc/${pid}/environ`).catch(() => null);
      if (!raw) return null;
      const prefix = `${name}=`;
      for (const entry of raw.toString('utf8').split('\0')) {
        if (entry.startsWith(prefix)) return entry.slice(prefix.length);
      }
      return null;
    },
    async findByFinalArgument(marker) {
      if (platform === 'linux') return findOnLinux(marker);
      if (platform === 'darwin') {
        // -x includes processes without a controlling terminal; ps lists only
        // the current user's processes unless asked otherwise.
        const result = await runner.run('/bin/ps', ['-x', '-ww', '-o', 'pid=,command='], {
          env: {},
          timeoutMs: 10_000,
          maxOutputBytes: 8 * 1024 * 1024,
        });
        if (result.exitCode !== 0) return null;
        return parseProcessList(result.stdout, marker);
      }
      if (platform === 'win32') {
        const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
        // Fixed script; no value is interpolated into it. Command lines of
        // other users' processes are not readable without elevation.
        const result = await runner.run(
          `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }',
          ],
          { env: { SystemRoot: systemRoot }, timeoutMs: 15_000, maxOutputBytes: 8 * 1024 * 1024 },
        );
        if (result.exitCode !== 0) return null;
        return parseProcessList(result.stdout, marker);
      }
      return null;
    },
  };
}

/** Parses `<pid> <command line>` lines and returns the PIDs ending with `marker`. */
export function parseProcessList(output: string, marker: string): number[] {
  const pids: number[] = [];
  for (const line of output.split(/\r\n|\n|\r/)) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match?.[1] || match[2] === undefined) continue;
    const pid = Number(match[1]);
    if (Number.isInteger(pid) && pid > 0 && commandLineEndsWithArgument(match[2], marker))
      pids.push(pid);
  }
  return pids;
}

async function findOnLinux(marker: string): Promise<number[] | null> {
  const entries = await fs.readdir('/proc').catch(() => null);
  if (!entries) return null;
  const uid = process.getuid?.();
  const pids: number[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      if (uid !== undefined && (await fs.stat(`/proc/${entry}`)).uid !== uid) continue;
      const args = (await fs.readFile(`/proc/${entry}/cmdline`))
        .toString('utf8')
        .replace(/\0+$/, '')
        .split('\0');
      if (args.at(-1) === marker && !args.some((arg) => arg.startsWith('--type='))) pids.push(pid);
    } catch {
      // The process exited while the list was being read.
    }
  }
  return pids;
}

export function createNodeSystemContext(): SystemContext {
  return {
    platform: process.platform,
    arch: process.arch,
    homeDir: os.homedir(),
    env: process.env,
    files: nodeFileProbe,
    runner: nodeCommandRunner,
    spawner: nodeProcessSpawner,
    processes: createNodeProcessInspector(process.platform, nodeCommandRunner),
  };
}
