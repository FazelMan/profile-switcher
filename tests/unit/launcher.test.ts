import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CliLaunchPlan } from '../../src/main/adapters/types';
import { Launcher, LINUX_PID_WRAPPER_SCRIPT } from '../../src/main/launch/launcher';
import { fakeFiles, fakeRunner, fakeSpawner, fakeSystem, nullLogger } from '../helpers/fake-system';

function cliPlan(overrides: Partial<CliLaunchPlan> = {}): CliLaunchPlan {
  return {
    type: 'cli',
    executable: '/home/tester/.local/bin/claude',
    args: [],
    env: {
      set: { CLAUDE_CONFIG_DIR: '/data/profiles/claude-code/work-abc234' },
      unset: ['ANTHROPIC_API_KEY'],
      prependPath: ['/home/tester/.local/bin'],
    },
    cwd: '/home/tester',
    isolation: 'isolated',
    ...overrides,
  };
}

const context = {
  profileId: 'work-abc234',
  launchId: 'abcdef123456',
  preferredTerminal: 'auto' as const,
  pidFile: null,
};

describe('Launcher on Linux', () => {
  const files = fakeFiles({
    '/usr/bin/env': 'exec',
    '/usr/bin/gnome-terminal': 'exec',
    '/usr/bin/xterm': 'exec',
  });

  it('runs the CLI inside a terminal via env, without a shell, preserving unrelated variables', async () => {
    const spawner = fakeSpawner();
    const system = fakeSystem({
      env: { PATH: '/usr/bin:/bin', ANTHROPIC_API_KEY: 'sk-ant-x', LANG: 'C.UTF-8' },
      files,
      spawner,
    });
    const report = await new Launcher(system, '/data/launchers', nullLogger).launch(
      cliPlan(),
      context,
    );

    // The terminal emulator's PID is not the application's, so it is not reported.
    expect(report).toMatchObject({
      method: 'terminal',
      isolation: 'isolated',
      terminal: 'GNOME Terminal',
      pid: null,
      tracking: 'none',
    });
    expect(report.notes.map((n) => n.code)).toContain('launch.note.notProofOfSignIn');
    const call = spawner.calls[0]!;
    expect(call.file).toBe('/usr/bin/gnome-terminal');
    expect(call.args).toEqual([
      '--working-directory=/home/tester',
      '--',
      '/usr/bin/env',
      '-u',
      'ANTHROPIC_API_KEY',
      'CLAUDE_CONFIG_DIR=/data/profiles/claude-code/work-abc234',
      'PATH=/home/tester/.local/bin:/usr/bin:/bin',
      '/home/tester/.local/bin/claude',
    ]);
    expect(call.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(call.env.LANG).toBe('C.UTF-8');
    expect(call.env.CLAUDE_CONFIG_DIR).toBe('/data/profiles/claude-code/work-abc234');
    expect(call.cwd).toBe('/home/tester');
  });

  it('records the PID of the process that becomes the application, via a fixed wrapper script', async () => {
    const spawner = fakeSpawner();
    const system = fakeSystem({ env: { PATH: '/usr/bin:/bin' }, files, spawner });
    const report = await new Launcher(system, '/l', nullLogger).launch(cliPlan(), {
      ...context,
      pidFile: '/run dir/work-abc234.abcdef123456.pid',
    });
    expect(report).toMatchObject({ launchId: 'abcdef123456', tracking: 'pid-file', pid: null });
    const args = spawner.calls[0]!.args;
    expect(args.slice(0, 7)).toEqual([
      '--working-directory=/home/tester',
      '--',
      '/bin/sh',
      '-c',
      LINUX_PID_WRAPPER_SCRIPT,
      'profile-switcher-launch',
      '/run dir/work-abc234.abcdef123456.pid',
    ]);
    expect(args[7]).toBe('/usr/bin/env');
    expect(args.at(-1)).toBe('/home/tester/.local/bin/claude');
    // The script text is constant: no path or profile value is interpolated into it.
    expect(LINUX_PID_WRAPPER_SCRIPT).not.toMatch(/claude|work|tester/);
  });

  it('honours the preferred terminal and reports when it is missing', async () => {
    const spawner = fakeSpawner();
    const system = fakeSystem({ files, spawner });
    await new Launcher(system, '/l', nullLogger).launch(cliPlan(), {
      ...context,
      preferredTerminal: 'xterm',
    });
    expect(spawner.calls[0]?.file).toBe('/usr/bin/xterm');
    expect(spawner.calls[0]?.args.slice(0, 2)).toEqual(['-e', '/usr/bin/env']);

    await expect(
      new Launcher(system, '/l', nullLogger).launch(cliPlan(), {
        ...context,
        preferredTerminal: 'kitty',
      }),
    ).rejects.toMatchObject({ appError: { code: 'TERMINAL_NOT_FOUND' } });
    await expect(
      new Launcher(
        fakeSystem({ files: fakeFiles({ '/usr/bin/env': 'exec' }) }),
        '/l',
        nullLogger,
      ).launch(cliPlan(), context),
    ).rejects.toMatchObject({ appError: { code: 'TERMINAL_NOT_FOUND' } });
  });

  it('refuses executables that env would misparse and values with control characters', async () => {
    const system = fakeSystem({ files });
    await expect(
      new Launcher(system, '/l', nullLogger).launch(
        cliPlan({ executable: '/opt/a=b/claude' }),
        context,
      ),
    ).rejects.toMatchObject({ appError: { code: 'EXECUTABLE_INVALID' } });
    await expect(
      new Launcher(system, '/l', nullLogger).launch(
        cliPlan({ env: { set: { CLAUDE_CONFIG_DIR: '/x\n/y' }, unset: [], prependPath: [] } }),
        context,
      ),
    ).rejects.toMatchObject({ appError: { code: 'EXECUTABLE_INVALID' } });
  });

  it('maps spawn errors to LAUNCH_FAILED without leaking details', async () => {
    const error = Object.assign(new Error('spawn EACCES /secret/path'), { code: 'EACCES' });
    const system = fakeSystem({ files, spawner: fakeSpawner(error) });
    await expect(
      new Launcher(system, '/l', nullLogger).launch(cliPlan(), context),
    ).rejects.toMatchObject({
      appError: { code: 'LAUNCH_FAILED', detail: 'spawn failed: EACCES' },
    });
  });

  it('does not launch desktop apps on Linux', async () => {
    await expect(
      new Launcher(fakeSystem({ files }), '/l', nullLogger).launch(
        { type: 'desktop', target: '/opt/x', isolation: 'shared' },
        context,
      ),
    ).rejects.toMatchObject({ appError: { code: 'APP_UNSUPPORTED_PLATFORM' } });
  });
});

// Simulates macOS with real temp files; host path separators must be POSIX.
describe.skipIf(process.platform === 'win32')('Launcher on macOS', () => {
  let launchersDir: string;
  beforeEach(() => {
    launchersDir = mkdtempSync(path.join(os.tmpdir(), 'ps-launchers-'));
  });
  afterEach(() => rmSync(launchersDir, { recursive: true, force: true }));

  const files = fakeFiles({
    '/System/Applications/Utilities/Terminal.app': 'dir',
    '/Applications/iTerm.app': 'dir',
  });

  it('writes an owner-only launcher script and opens it in Terminal', async () => {
    const runner = fakeRunner(() => ({ exitCode: 0 }));
    const system = fakeSystem({ platform: 'darwin', homeDir: '/Users/ana', files, runner });
    const pidFile = path.join(launchersDir, 'run', 'work-abc234.abcdef123456.pid');
    const report = await new Launcher(system, launchersDir, nullLogger).launch(cliPlan(), {
      ...context,
      pidFile,
    });
    const scriptPath = path.join(launchersDir, 'work-abc234.abcdef123456.command');

    expect(report).toMatchObject({
      method: 'terminal',
      terminal: 'Terminal',
      tracking: 'pid-file',
    });
    expect(runner.calls[0]).toMatchObject({
      file: '/usr/bin/open',
      args: ['-a', '/System/Applications/Utilities/Terminal.app', scriptPath],
    });
    const script = readFileSync(scriptPath, 'utf8');
    expect(script).toContain("CLAUDE_CONFIG_DIR='/data/profiles/claude-code/work-abc234'");
    expect(script).toContain('unset ANTHROPIC_API_KEY');
    expect(script).toContain("exec '/home/tester/.local/bin/claude'");
    expect(script).toContain(`printf '%s' "$$" > '${pidFile}'`);
    expect(script.indexOf('printf')).toBeLessThan(script.indexOf('exec '));
    if (process.platform !== 'win32') expect(statSync(scriptPath).mode & 0o777).toBe(0o700);
  });

  it('uses iTerm when preferred and reports open failures', async () => {
    const runner = fakeRunner(() => ({ exitCode: 1 }));
    const system = fakeSystem({ platform: 'darwin', files, runner });
    await expect(
      new Launcher(system, launchersDir, nullLogger).launch(cliPlan(), {
        ...context,
        preferredTerminal: 'iterm',
      }),
    ).rejects.toMatchObject({ appError: { code: 'LAUNCH_FAILED' } });
    expect(runner.calls[0]?.args[1]).toBe('/Applications/iTerm.app');
  });

  it('opens desktop apps with `open -a` and no extra arguments', async () => {
    const runner = fakeRunner(() => ({ exitCode: 0 }));
    const system = fakeSystem({ platform: 'darwin', files, runner });
    const report = await new Launcher(system, launchersDir, nullLogger).launch(
      { type: 'desktop', target: '/Applications/Claude.app', isolation: 'shared' },
      context,
    );
    expect(runner.calls[0]?.args).toEqual(['-a', '/Applications/Claude.app']);
    expect(report.notes.map((n) => n.code)).toContain('launch.note.sharedLaunch');
    expect(report.tracking).toBe('none');
  });
});

describe('Launcher on Windows', () => {
  it('starts a native .exe directly in its own console with the profile environment', async () => {
    const spawner = fakeSpawner();
    const system = fakeSystem({
      platform: 'win32',
      homeDir: 'C:\\Users\\Ana',
      env: { Path: 'C:\\Windows', anthropic_api_key: 'sk-ant-x', SystemRoot: 'C:\\Windows' },
      spawner,
    });
    const onExit = () => undefined;
    const report = await new Launcher(system, 'C:\\l', nullLogger).launch(
      cliPlan({
        executable: 'C:\\Users\\Ana\\.local\\bin\\claude.exe',
        cwd: 'C:\\Users\\Ana',
        env: {
          set: { CLAUDE_CONFIG_DIR: 'C:\\P\\work' },
          unset: ['ANTHROPIC_API_KEY'],
          prependPath: ['C:\\Users\\Ana\\.local\\bin'],
        },
      }),
      { ...context, onExit },
    );
    expect(report).toMatchObject({ tracking: 'child', pid: 4242 });
    const call = spawner.calls[0]!;
    expect(call.file).toBe('C:\\Users\\Ana\\.local\\bin\\claude.exe');
    expect(call.args).toEqual([]);
    expect(call.windowsVerbatimArguments).toBe(false);
    expect(call.env.anthropic_api_key).toBeUndefined();
    expect(call.env.CLAUDE_CONFIG_DIR).toBe('C:\\P\\work');
    expect(call.env.Path).toBe('C:\\Users\\Ana\\.local\\bin;C:\\Windows');
  });

  it('runs npm .cmd shims through cmd.exe /k with validated, verbatim arguments', async () => {
    const spawner = fakeSpawner();
    const system = fakeSystem({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, spawner });
    const report = await new Launcher(system, 'C:\\l', nullLogger).launch(
      cliPlan({
        executable: 'C:\\Users\\Ana\\AppData\\Roaming\\npm\\claude.cmd',
        cwd: 'C:\\',
        env: { set: {}, unset: [], prependPath: [] },
      }),
      context,
    );
    // cmd.exe outlives the application under /k, so it is never reported as the app.
    expect(report.tracking).toBe('none');
    expect(spawner.calls[0]).toMatchObject({
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/k', '""C:\\Users\\Ana\\AppData\\Roaming\\npm\\claude.cmd""'],
      windowsVerbatimArguments: true,
    });

    await expect(
      new Launcher(system, 'C:\\l', nullLogger).launch(
        cliPlan({ executable: 'C:\\x%PATH%\\claude.cmd', cwd: 'C:\\' }),
        context,
      ),
    ).rejects.toMatchObject({ appError: { code: 'EXECUTABLE_INVALID' } });
  });
});
