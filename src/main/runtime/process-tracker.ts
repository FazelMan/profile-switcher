import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { profileIdSchema } from '@shared/domain/profile';
import type { InstanceStatus, ProcessTracking, RuntimeSnapshot } from '@shared/ipc';
import type { Logger } from '../diagnostics/logger';
import { pathApiFor, samePath } from '../platform';
import { writeFileAtomic } from '../storage/atomic-write';
import { commandLineEndsWithArgument, type SystemContext } from '../system';

/** How long a launch may take to report its PID before it is shown as unconfirmed. */
const STARTUP_GRACE_MS = 20_000;
/** Unconfirmed launches that never produced a PID are forgotten after this long. */
const UNCONFIRMED_RETENTION_MS = 5 * 60_000;

export const LAUNCH_ID_PATTERN = /^[a-f0-9]{12}$/;

const recordSchema = z
  .object({
    launchId: z.string().regex(LAUNCH_ID_PATTERN),
    profileId: profileIdSchema,
    startedAt: z.iso.datetime(),
    tracking: z.enum(['pid-file', 'child', 'marker', 'none']),
    pid: z.number().int().positive().nullable(),
    executable: z.string().min(1).max(4096),
    /** Final argument identifying the main process (`marker` tracking). Absent in 0.1.x records. */
    marker: z.string().min(1).max(5000).nullable().default(null),
    /** Variables the launch set (e.g. CLAUDE_CONFIG_DIR). Paths only, never credentials. */
    expectedEnv: z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(4096)),
  })
  .strict();

type LaunchRecord = z.infer<typeof recordSchema>;

interface TrackedLaunch extends LaunchRecord {
  /** True while Profile Switcher holds the process handle (this session only). */
  handleHeld: boolean;
  exited: boolean;
}

export interface RegisterLaunch {
  launchId: string;
  profileId: string;
  tracking: ProcessTracking;
  pid: number | null;
  executable: string;
  marker: string | null;
  expectedEnv: Record<string, string>;
}

/** A launch's current status together with the profile it belongs to. */
export interface TrackedStatus {
  profileId: string;
  status: InstanceStatus;
}

/**
 * Follows launched instances so the UI can say which profiles are running.
 *
 * A profile is reported as running only when a live process is found AND its
 * identity matches the launched executable. Where the OS allows (Linux), the
 * process's own CLAUDE_CONFIG_DIR is read back and compared, so the UI can
 * state that the running process really uses the profile's folder.
 *
 * The tracker only observes processes; it never signals them. (Switch mode
 * closes instances through runtime/process-closer.ts, and only after the
 * user confirmed.) Records live in the runtime directory so they survive a
 * Profile Switcher restart.
 */
export class ProcessTracker {
  private readonly launches = new Map<string, TrackedLaunch>();
  /** Exits reported before the launch was registered (very short-lived processes). */
  private readonly earlyExits = new Set<string>();

  constructor(
    private readonly system: SystemContext,
    private readonly runtimeDir: string,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  pidFileFor(profileId: string, launchId: string): string {
    return pathApiFor(this.system.platform).join(this.runtimeDir, `${profileId}.${launchId}.pid`);
  }

  private recordFileFor(launch: { profileId: string; launchId: string }): string {
    return pathApiFor(this.system.platform).join(
      this.runtimeDir,
      `${launch.profileId}.${launch.launchId}.json`,
    );
  }

  async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.runtimeDir, { recursive: true, mode: 0o700 });
  }

  /** Reloads launch records written by a previous Profile Switcher session. */
  async restore(): Promise<void> {
    await this.ensureDirectory();
    const entries = await fs.readdir(this.runtimeDir).catch(() => [] as string[]);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const file = path.join(this.runtimeDir, entry);
      try {
        const record = recordSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
        if (!this.launches.has(record.launchId))
          this.launches.set(record.launchId, { ...record, handleHeld: false, exited: false });
      } catch {
        await fs.rm(file, { force: true }).catch(() => undefined);
      }
    }
  }

  async register(launch: RegisterLaunch): Promise<void> {
    const record: LaunchRecord = { ...launch, startedAt: this.now().toISOString() };
    const tracked: TrackedLaunch = {
      ...record,
      handleHeld: launch.tracking === 'child',
      exited: this.earlyExits.delete(launch.launchId),
    };
    this.launches.set(launch.launchId, tracked);
    if (launch.tracking !== 'none') {
      await this.ensureDirectory();
      await writeFileAtomic(this.recordFileFor(record), JSON.stringify(recordSchema.parse(record)));
    }
  }

  /** Reported by the spawner when a directly held process exits. */
  markExited(launchId: string): void {
    const launch = this.launches.get(launchId);
    if (launch) launch.exited = true;
    else this.earlyExits.add(launchId);
  }

  /** Whether a live process is the launched application (and, for markers, this profile's instance). */
  private matchesLaunch(commandLine: string, launch: TrackedLaunch): boolean {
    if (!this.matchesExecutable(commandLine, launch.executable)) return false;
    // Windows only exposes the image name here; the marker was matched
    // against the full command line when the process was discovered.
    if (launch.marker && this.system.platform !== 'win32')
      return commandLineEndsWithArgument(commandLine, launch.marker);
    return true;
  }

  private matchesExecutable(commandLine: string, executable: string): boolean {
    const caseInsensitive = this.system.platform === 'win32' || this.system.platform === 'darwin';
    const norm = (value: string) => (caseInsensitive ? value.toLowerCase() : value);
    if (norm(commandLine).includes(norm(executable))) return true;
    const p = pathApiFor(this.system.platform);
    const first = commandLine.trim().split(/\s+/)[0] ?? '';
    return norm(p.basename(first)) === norm(p.basename(executable));
  }

  /** Finds the main process carrying a launch's marker argument. */
  private async discoverPid(launch: TrackedLaunch): Promise<number | null> {
    if (!launch.marker) return null;
    const found = await this.system.processes.findByFinalArgument(launch.marker);
    return found && found.length > 0 ? Math.min(...found) : null;
  }

  private async readPid(launch: TrackedLaunch): Promise<number | null> {
    if (launch.pid !== null) return launch.pid;
    let pid: number;
    if (launch.tracking === 'marker') {
      pid = (await this.discoverPid(launch)) ?? NaN;
    } else if (launch.tracking === 'pid-file') {
      const text = await fs
        .readFile(this.pidFileFor(launch.profileId, launch.launchId), 'utf8')
        .catch(() => null);
      pid = text === null ? NaN : Number.parseInt(text.trim(), 10);
    } else {
      return null;
    }
    if (!Number.isInteger(pid) || pid <= 0) return null;
    launch.pid = pid;
    await writeFileAtomic(
      this.recordFileFor(launch),
      JSON.stringify(recordSchema.parse(this.toRecord(launch))),
    ).catch(() => undefined);
    return pid;
  }

  private toRecord(launch: TrackedLaunch): LaunchRecord {
    const { handleHeld: _held, exited: _exited, ...record } = launch;
    return record;
  }

  private async forget(launch: TrackedLaunch): Promise<void> {
    this.launches.delete(launch.launchId);
    await fs.rm(this.recordFileFor(launch), { force: true }).catch(() => undefined);
    await fs
      .rm(this.pidFileFor(launch.profileId, launch.launchId), { force: true })
      .catch(() => undefined);
  }

  private async configDirectoryState(
    pid: number,
    expected: Record<string, string>,
  ): Promise<InstanceStatus['configDirectory']> {
    const entries = Object.entries(expected);
    if (entries.length === 0) return 'not-checked';
    for (const [name, value] of entries) {
      const actual = await this.system.processes.environmentVariable(pid, name);
      if (actual === undefined) return 'not-checked';
      if (actual === null || !samePath(actual, value, this.system.platform)) return 'mismatch';
    }
    return 'verified';
  }

  /** Returns null when the launch has exited (it is then forgotten). */
  private async evaluate(launch: TrackedLaunch): Promise<InstanceStatus | null> {
    const base = { launchId: launch.launchId, startedAt: launch.startedAt };
    const age = this.now().getTime() - new Date(launch.startedAt).getTime();

    if (launch.tracking === 'none') {
      return age > STARTUP_GRACE_MS
        ? (await this.forget(launch), null)
        : { ...base, pid: launch.pid, state: 'untracked', configDirectory: 'not-checked' };
    }
    if (launch.exited) {
      await this.forget(launch);
      return null;
    }

    const pid = await this.readPid(launch);
    if (pid !== null && launch.tracking === 'marker' && (await this.dropDuplicate(launch, pid)))
      return null;
    if (pid === null) {
      if (age < STARTUP_GRACE_MS)
        return { ...base, pid: null, state: 'starting', configDirectory: 'not-checked' };
      if (age > UNCONFIRMED_RETENTION_MS) {
        await this.forget(launch);
        return null;
      }
      return { ...base, pid: null, state: 'unconfirmed', configDirectory: 'not-checked' };
    }

    if (!this.system.processes.isAlive(pid)) {
      await this.forget(launch);
      return null;
    }

    if (launch.handleHeld) {
      // We started this exact process and still hold its handle.
      return {
        ...base,
        pid,
        state: 'running',
        configDirectory: await this.configDirectoryState(pid, launch.expectedEnv),
      };
    }

    const commandLine = await this.system.processes.commandLine(pid);
    if (commandLine === null || !this.matchesLaunch(commandLine, launch)) {
      // Alive, but it may still be the launcher shell, or the PID may have
      // been reused. Do not call it running.
      return {
        ...base,
        pid,
        state: age < STARTUP_GRACE_MS ? 'starting' : 'unconfirmed',
        configDirectory: 'not-checked',
      };
    }
    return {
      ...base,
      pid,
      state: 'running',
      // A marker is the profile folder itself, read back from the process.
      configDirectory: launch.marker
        ? 'verified'
        : await this.configDirectoryState(pid, launch.expectedEnv),
    };
  }

  /**
   * When an application hands a repeated launch to its already-running
   * instance (single-instance apps), both launches resolve to one process.
   * Keep the older record so the instance is listed once.
   */
  private async dropDuplicate(launch: TrackedLaunch, pid: number): Promise<boolean> {
    const older = [...this.launches.values()].some(
      (other) =>
        other !== launch &&
        other.profileId === launch.profileId &&
        other.pid === pid &&
        other.startedAt <= launch.startedAt,
    );
    if (older) await this.forget(launch);
    return older;
  }

  /** Re-checks one launch right now. Null when it is unknown or has exited. */
  async status(launchId: string): Promise<TrackedStatus | null> {
    const launch = this.launches.get(launchId);
    if (!launch) return null;
    const status = await this.evaluate(launch);
    return status ? { profileId: launch.profileId, status } : null;
  }

  async snapshot(existingProfileIds: ReadonlySet<string>): Promise<RuntimeSnapshot> {
    const result: RuntimeSnapshot = {};
    for (const launch of [...this.launches.values()]) {
      if (!existingProfileIds.has(launch.profileId)) {
        await this.forget(launch);
        continue;
      }
      let status: InstanceStatus | null;
      try {
        status = await this.evaluate(launch);
      } catch (error) {
        this.logger.warn('runtime.evaluate-failed', { launchId: launch.launchId, error });
        status = {
          launchId: launch.launchId,
          startedAt: launch.startedAt,
          pid: launch.pid,
          state: 'unconfirmed',
          configDirectory: 'not-checked',
        };
      }
      if (status) (result[launch.profileId] ??= []).push(status);
    }
    return result;
  }
}
