import { createNullLogger } from '../../src/main/diagnostics/logger';
import {
  commandLineEndsWithArgument,
  createNodeProcessInspector,
  nodeFileProbe,
  type CommandRunner,
  type FileProbe,
  type ProcessInspector,
  type ProcessSpawner,
  type RunResult,
  type SystemContext,
} from '../../src/main/system';

export type FakeEntry = 'file' | 'exec' | 'dir';

export interface RecordedRun {
  file: string;
  args: readonly string[];
  env: Record<string, string>;
  cwd?: string;
  windowsVerbatimArguments?: boolean;
}

export interface RecordedSpawn {
  file: string;
  args: readonly string[];
  env: Record<string, string>;
  cwd: string;
  windowsVerbatimArguments?: boolean;
}

/** A FileProbe backed by an in-memory map of paths. */
export function fakeFiles(
  entries: Record<string, FakeEntry>,
  contents: Record<string, string> = {},
): FileProbe {
  return {
    async stat(p) {
      const entry = entries[p];
      if (!entry) return null;
      return { isFile: entry !== 'dir', isDirectory: entry === 'dir' };
    },
    async isExecutable(p) {
      return entries[p] === 'exec';
    },
    async isWritable(p) {
      return entries[p] !== undefined;
    },
    async isEmptyDirectory(p) {
      if (entries[p] !== 'dir') return null;
      return !Object.keys(entries).some(
        (key) => key !== p && key.startsWith(p.endsWith('/') ? p : `${p}/`),
      );
    },
    async readTextFile(p) {
      return contents[p] ?? null;
    },
    async listDirectory(p) {
      if (entries[p] !== 'dir') return null;
      const separator = p.includes('\\') ? '\\' : '/';
      const prefix = p.endsWith(separator) ? p : `${p}${separator}`;
      return Object.keys(entries)
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes(separator))
        .map((key) => key.slice(prefix.length));
    },
  };
}

export function fakeRunner(
  respond: (call: RecordedRun) => Partial<RunResult> | Promise<Partial<RunResult>> = () => ({
    exitCode: 0,
    stdout: '',
  }),
): CommandRunner & { calls: RecordedRun[] } {
  const calls: RecordedRun[] = [];
  return {
    calls,
    async run(file, args, options) {
      const call: RecordedRun = {
        file,
        args,
        env: options.env,
        cwd: options.cwd,
        windowsVerbatimArguments: options.windowsVerbatimArguments,
      };
      calls.push(call);
      const result = await respond(call);
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, ...result };
    },
  };
}

export function fakeSpawner(fail?: Error): ProcessSpawner & { calls: RecordedSpawn[] } {
  const calls: RecordedSpawn[] = [];
  return {
    calls,
    async spawnDetached(file, args, options) {
      calls.push({
        file,
        args,
        env: options.env,
        cwd: options.cwd,
        windowsVerbatimArguments: options.windowsVerbatimArguments,
      });
      if (fail) throw fail;
      return { pid: 4242 };
    },
  };
}

/** In-memory process table: pid → command line and environment. */
export function fakeProcesses(
  table: Record<number, { commandLine: string; env?: Record<string, string> }> = {},
): ProcessInspector & {
  table: typeof table;
} {
  return {
    table,
    isAlive: (pid) => pid in table,
    commandLine: async (pid) => table[pid]?.commandLine ?? null,
    environmentVariable: async (pid, name) =>
      table[pid] ? (table[pid]!.env?.[name] ?? null) : null,
    findByFinalArgument: async (marker) =>
      Object.entries(table)
        .filter(([, entry]) => commandLineEndsWithArgument(entry.commandLine, marker))
        .map(([pid]) => Number(pid)),
  };
}

export function fakeSystem(overrides: Partial<SystemContext> = {}): SystemContext {
  return {
    platform: 'linux',
    arch: 'x64',
    homeDir: '/home/tester',
    env: { PATH: '/usr/bin:/bin', HOME: '/home/tester' },
    files: fakeFiles({}),
    runner: fakeRunner(),
    spawner: fakeSpawner(),
    processes: fakeProcesses(),
    ...overrides,
  };
}

/** A system context that uses the real filesystem but fake process APIs. */
export function realFsSystem(
  homeDir: string,
  overrides: Partial<SystemContext> = {},
): SystemContext {
  return fakeSystem({
    platform: process.platform,
    homeDir,
    env: { PATH: '/usr/bin:/bin', HOME: homeDir },
    files: nodeFileProbe,
    processes: createNodeProcessInspector(process.platform, fakeRunner()),
    ...overrides,
  });
}

export const nullLogger = createNullLogger();
