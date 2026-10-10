import { promises as fs } from 'node:fs';
import { AppFailure } from '@shared/domain/errors';
import { msg, type Message } from '@shared/domain/messages';
import type { TerminalId } from '@shared/domain/settings';
import type { LaunchReport } from '@shared/ipc';
import type { CliLaunchPlan, DesktopLaunchPlan, LaunchPlan } from '../adapters/types';
import { windowsComspec } from '../adapters/detection';
import type { Logger } from '../diagnostics/logger';
import { pathApiFor } from '../platform';
import { writeFileAtomic } from '../storage/atomic-write';
import type { SystemContext } from '../system';
import { buildPosixLauncherScript } from './commands';
import { applyEnvChanges, cloneEnv } from './environment';
import { isWindowsShim, UnsafeValueError, windowsShimInvocation } from './quoting';
import { resolveLinuxTerminal, resolveMacTerminal } from './terminals';

const OPEN_TIMEOUT_MS = 15_000;
const POSIX_ENV_CANDIDATES = ['/usr/bin/env', '/bin/env'];
// eslint-disable-next-line no-control-regex
const UNSAFE_ARG = /[\u0000\n\r]/;

export interface LaunchContext {
  profileId: string;
  launchId: string;
  preferredTerminal: TerminalId;
  /**
   * Where the launched shell should record its own PID before exec'ing the
   * application (macOS/Linux terminal launches). Null disables PID recording.
   */
  pidFile: string | null;
  /** Called when a directly started process exits (Windows console launches). */
  onExit?: (code: number | null) => void;
}

/**
 * Fixed script used on Linux to record the PID of the process that becomes
 * the application: it writes `$$` to the file given as $1, drops that
 * argument, and exec's the remaining argument vector. No value is ever
 * interpolated into the script text; everything arrives as positional argv.
 */
export const LINUX_PID_WRAPPER_SCRIPT = 'printf "%s" "$$" > "$1" && shift && exec "$@"';

/**
 * Starts applications for profiles. Every process is started with
 * `shell: false` and an argument vector. A successful return means the OS
 * started the terminal or application process; it is not proof that the
 * user signed in or that the application honored the profile's isolation.
 */
export class Launcher {
  constructor(
    private readonly system: SystemContext,
    private readonly launchersDir: string,
    private readonly logger: Logger,
  ) {}

  async launch(plan: LaunchPlan, context: LaunchContext): Promise<LaunchReport> {
    try {
      return plan.type === 'cli'
        ? await this.launchCli(plan, context)
        : await this.launchDesktop(plan, context);
    } catch (error) {
      if (error instanceof AppFailure) throw error;
      if (error instanceof UnsafeValueError) {
        throw new AppFailure('EXECUTABLE_INVALID', undefined, error.message);
      }
      const code = (error as { code?: unknown }).code;
      this.logger.error('launch.spawn-failed', {
        code: typeof code === 'string' ? code : 'unknown',
      });
      throw new AppFailure(
        'LAUNCH_FAILED',
        undefined,
        `spawn failed: ${typeof code === 'string' ? code : 'unknown'}`,
      );
    }
  }

  private report(
    plan: LaunchPlan,
    context: LaunchContext,
    fields: {
      method: 'terminal' | 'direct';
      terminal: string | null;
      pid: number | null;
      tracking: LaunchReport['tracking'];
    },
  ): LaunchReport {
    return {
      launchId: context.launchId,
      closedProfileIds: [],
      isolation: plan.isolation,
      notes: this.notes(plan, fields.method),
      ...fields,
    };
  }

  private notes(plan: LaunchPlan, method: 'terminal' | 'direct'): Message[] {
    const notes: Message[] = [
      msg(method === 'terminal' ? 'launch.note.terminalOpened' : 'launch.note.processStarted'),
    ];
    if (plan.isolation === 'shared') notes.push(msg('launch.note.sharedLaunch'));
    if (plan.isolation === 'experimental') notes.push(msg('launch.note.experimentalLaunch'));
    notes.push(msg('launch.note.notProofOfSignIn'));
    return notes;
  }

  private assertSafePlan(plan: CliLaunchPlan): void {
    const values = [
      plan.executable,
      plan.cwd,
      ...plan.args,
      ...Object.values(plan.env.set),
      ...plan.env.prependPath,
    ];
    if (values.some((value) => UNSAFE_ARG.test(value))) {
      throw new AppFailure(
        'EXECUTABLE_INVALID',
        undefined,
        'launch plan contains control characters',
      );
    }
  }

  private async launchCli(plan: CliLaunchPlan, context: LaunchContext): Promise<LaunchReport> {
    this.assertSafePlan(plan);
    const { platform } = this.system;
    const env = applyEnvChanges(this.system.env, plan.env, platform);

    if (platform === 'darwin') {
      const resolved = await resolveMacTerminal(this.system, context.preferredTerminal);
      if (!resolved) throw new AppFailure('TERMINAL_NOT_FOUND');
      await fs.mkdir(this.launchersDir, { recursive: true, mode: 0o700 });
      // One script per launch, so launching another profile (or the same
      // profile again) never rewrites a script another window is reading.
      const scriptPath = pathApiFor('darwin').join(
        this.launchersDir,
        `${context.profileId}.${context.launchId}.command`,
      );
      await writeFileAtomic(
        scriptPath,
        buildPosixLauncherScript(plan, context.profileId, context.pidFile),
        { mode: 0o700 },
      );
      await fs.chmod(scriptPath, 0o700);
      await this.runOpen(['-a', resolved.bundle, scriptPath]);
      this.logger.info('launch.started', {
        method: 'terminal',
        terminal: resolved.terminal.id,
        isolation: plan.isolation,
      });
      return this.report(plan, context, {
        method: 'terminal',
        terminal: resolved.terminal.displayName,
        pid: null,
        tracking: context.pidFile ? 'pid-file' : 'none',
      });
    }

    if (platform === 'win32') {
      const shim = isWindowsShim(plan.executable);
      const call = shim
        ? windowsShimInvocation(plan.executable, plan.args, '/k', windowsComspec(this.system))
        : { file: plan.executable, args: plan.args, windowsVerbatimArguments: false };
      // A detached console program receives its own console window. For a
      // native .exe the started process IS the application, so its handle
      // tracks it reliably. For a .cmd shim the process is cmd.exe, which
      // outlives the application (/k), so it is not reported as running.
      const { pid } = await this.system.spawner.spawnDetached(call.file, call.args, {
        env,
        cwd: plan.cwd,
        windowsVerbatimArguments: call.windowsVerbatimArguments,
        ...(shim || !context.onExit ? {} : { onExit: context.onExit }),
      });
      this.logger.info('launch.started', {
        method: 'terminal',
        terminal: 'windows-console',
        isolation: plan.isolation,
      });
      return this.report(plan, context, {
        method: 'terminal',
        terminal: 'Windows console',
        pid,
        tracking: shim || pid === null ? 'none' : 'child',
      });
    }

    // Linux: a terminal emulator runs `env` with the profile's changes so
    // the variables apply even when the emulator hands the command to an
    // already-running server process that does not inherit our environment.
    const resolved = await resolveLinuxTerminal(this.system, context.preferredTerminal);
    if (!resolved) throw new AppFailure('TERMINAL_NOT_FOUND');
    const envBinary = await this.findPosixEnv();
    if (plan.executable.includes('=')) {
      // `env` would parse NAME=VALUE-looking paths as assignments.
      throw new AppFailure('EXECUTABLE_INVALID', undefined, 'executable path contains "="');
    }
    const pathKey = Object.keys(env).find((key) => key === 'PATH');
    const envCommand = [
      envBinary,
      ...plan.env.unset.flatMap((name) => ['-u', name]),
      ...Object.entries(plan.env.set).map(([name, value]) => `${name}=${value}`),
      ...(pathKey ? [`PATH=${env[pathKey] ?? ''}`] : []),
      plan.executable,
      ...plan.args,
    ];
    const command = context.pidFile
      ? [
          '/bin/sh',
          '-c',
          LINUX_PID_WRAPPER_SCRIPT,
          'profile-switcher-launch',
          context.pidFile,
          ...envCommand,
        ]
      : envCommand;
    // The terminal's own PID is not reported: many emulators hand the command
    // to a server process and exit immediately.
    await this.system.spawner.spawnDetached(
      resolved.path,
      resolved.terminal.buildArgs(command, plan.cwd),
      {
        env,
        cwd: plan.cwd,
      },
    );
    this.logger.info('launch.started', {
      method: 'terminal',
      terminal: resolved.terminal.id,
      isolation: plan.isolation,
    });
    return this.report(plan, context, {
      method: 'terminal',
      terminal: resolved.terminal.displayName,
      pid: null,
      tracking: context.pidFile ? 'pid-file' : 'none',
    });
  }

  private async launchDesktop(
    plan: DesktopLaunchPlan,
    context: LaunchContext,
  ): Promise<LaunchReport> {
    if ([plan.target, ...plan.args].some((value) => UNSAFE_ARG.test(value)))
      throw new AppFailure('EXECUTABLE_INVALID');
    if (plan.marker !== null && plan.args.at(-1) !== plan.marker)
      throw new AppFailure('INTERNAL_ERROR', undefined, 'launch marker must be the last argument');
    const { platform } = this.system;
    if (platform === 'darwin') {
      // `open` hands off to LaunchServices, so the app is attributed to itself
      // (not to Profile Switcher) for permission prompts, and its PID is not
      // returned. `-n` starts a separate instance for a profile with its own
      // folder; an ordinary launch focuses the running app instead.
      await this.runOpen(
        plan.args.length > 0
          ? ['-n', '-a', plan.target, '--args', ...plan.args]
          : ['-a', plan.target],
      );
      this.logger.info('launch.started', { method: 'direct', isolation: plan.isolation });
      return this.report(plan, context, {
        method: 'direct',
        terminal: null,
        pid: null,
        tracking: plan.marker ? 'marker' : 'none',
      });
    }
    if (platform === 'win32') {
      // With a marker the main process is found by its final argument: the
      // started executable may be a launcher stub that exits right away.
      const { pid } = await this.system.spawner.spawnDetached(plan.target, plan.args, {
        env: cloneEnv(this.system.env),
        cwd: pathApiFor('win32').dirname(plan.target),
        ...(context.onExit && !plan.marker ? { onExit: context.onExit } : {}),
      });
      this.logger.info('launch.started', { method: 'direct', isolation: plan.isolation });
      return this.report(plan, context, {
        method: 'direct',
        terminal: null,
        pid: plan.marker ? null : pid,
        tracking: plan.marker ? 'marker' : pid === null ? 'none' : 'child',
      });
    }
    throw new AppFailure('APP_UNSUPPORTED_PLATFORM');
  }

  private async findPosixEnv(): Promise<string> {
    for (const candidate of POSIX_ENV_CANDIDATES) {
      const stat = await this.system.files.stat(candidate);
      if (stat?.isFile) return candidate;
    }
    throw new AppFailure('LAUNCH_FAILED', undefined, 'env binary not found');
  }

  /** Runs macOS `open`, which reports failure (e.g. app missing) via its exit code. */
  private async runOpen(args: string[]): Promise<void> {
    const result = await this.system.runner.run('/usr/bin/open', args, {
      env: cloneEnv(this.system.env),
      timeoutMs: OPEN_TIMEOUT_MS,
      maxOutputBytes: 4096,
    });
    if (result.exitCode !== 0) {
      this.logger.error('launch.open-failed', {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      });
      throw new AppFailure(
        'LAUNCH_FAILED',
        undefined,
        `open exited with ${String(result.exitCode)}`,
      );
    }
  }
}
