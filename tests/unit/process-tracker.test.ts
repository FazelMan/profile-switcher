import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessTracker } from '../../src/main/runtime/process-tracker';
import { fakeProcesses, fakeSystem, nullLogger } from '../helpers/fake-system';

const EXE = '/home/tester/.local/bin/claude';
const DIR_A = '/data/profiles/claude-code/personal-aaaaaa';
const DIR_B = '/data/profiles/claude-code/work-bbbbbb';

let runtimeDir: string;
let clock: Date;
const now = () => clock;

beforeEach(() => {
  runtimeDir = mkdtempSync(path.join(os.tmpdir(), 'ps-runtime-'));
  clock = new Date('2026-03-01T10:00:00.000Z');
});
afterEach(() => rmSync(runtimeDir, { recursive: true, force: true }));

function setup(
  table: Parameters<typeof fakeProcesses>[0] = {},
  platform: NodeJS.Platform = 'linux',
) {
  const processes = fakeProcesses(table);
  const tracker = new ProcessTracker(
    fakeSystem({ platform, processes }),
    runtimeDir,
    nullLogger,
    now,
  );
  return { tracker, processes };
}

const ids = new Set(['personal-aaaaaa', 'work-bbbbbb']);

async function registerPidFile(
  tracker: ProcessTracker,
  profileId: string,
  launchId: string,
  dir: string,
) {
  await tracker.register({
    launchId,
    profileId,
    tracking: 'pid-file',
    pid: null,
    executable: EXE,
    marker: null,
    expectedEnv: { CLAUDE_CONFIG_DIR: dir },
  });
}

describe('ProcessTracker', () => {
  it('reports starting until the launched shell records its PID, never "running" from a spawn alone', async () => {
    const { tracker } = setup();
    await registerPidFile(tracker, 'personal-aaaaaa', 'aaaaaaaaaaaa', DIR_A);
    expect((await tracker.snapshot(ids))['personal-aaaaaa']).toEqual([
      expect.objectContaining({ state: 'starting', pid: null }),
    ]);
    clock = new Date(clock.getTime() + 30_000);
    expect((await tracker.snapshot(ids))['personal-aaaaaa']?.[0]?.state).toBe('unconfirmed');
  });

  it('reports running only when the PID is alive AND identified, and verifies the config folder', async () => {
    const { tracker, processes } = setup();
    await registerPidFile(tracker, 'personal-aaaaaa', 'aaaaaaaaaaaa', DIR_A);
    writeFileSync(tracker.pidFileFor('personal-aaaaaa', 'aaaaaaaaaaaa'), '101');

    processes.table[101] = {
      commandLine: '/bin/sh -c printf ...',
      env: { CLAUDE_CONFIG_DIR: DIR_A },
    };
    expect((await tracker.snapshot(ids))['personal-aaaaaa']?.[0]).toMatchObject({
      pid: 101,
      state: 'starting',
    });

    processes.table[101] = { commandLine: `${EXE} --resume`, env: { CLAUDE_CONFIG_DIR: DIR_A } };
    expect((await tracker.snapshot(ids))['personal-aaaaaa']?.[0]).toMatchObject({
      pid: 101,
      state: 'running',
      configDirectory: 'verified',
    });
  });

  it('flags a running process whose configuration folder differs', async () => {
    const { tracker, processes } = setup({
      102: { commandLine: EXE, env: { CLAUDE_CONFIG_DIR: DIR_B } },
    });
    await registerPidFile(tracker, 'personal-aaaaaa', 'aaaaaaaaaaaa', DIR_A);
    writeFileSync(tracker.pidFileFor('personal-aaaaaa', 'aaaaaaaaaaaa'), '102');
    expect((await tracker.snapshot(ids))['personal-aaaaaa']?.[0]?.configDirectory).toBe('mismatch');
    delete processes.table[102]!.env;
    expect((await tracker.snapshot(ids))['personal-aaaaaa']?.[0]?.configDirectory).toBe('mismatch');
  });

  it('does not claim folder verification where the OS hides process environments', async () => {
    const processes = {
      ...fakeProcesses({ 103: { commandLine: EXE } }),
      environmentVariable: async () => undefined,
    };
    const tracker = new ProcessTracker(
      fakeSystem({ platform: 'darwin', processes }),
      runtimeDir,
      nullLogger,
      now,
    );
    await registerPidFile(tracker, 'personal-aaaaaa', 'aaaaaaaaaaaa', DIR_A);
    writeFileSync(tracker.pidFileFor('personal-aaaaaa', 'aaaaaaaaaaaa'), '103');
    expect((await tracker.snapshot(ids))['personal-aaaaaa']?.[0]).toMatchObject({
      state: 'running',
      configDirectory: 'not-checked',
    });
  });

  it('tracks concurrent profiles independently and forgets only the one that exits', async () => {
    const { tracker, processes } = setup({
      201: { commandLine: EXE, env: { CLAUDE_CONFIG_DIR: DIR_A } },
      202: { commandLine: EXE, env: { CLAUDE_CONFIG_DIR: DIR_B } },
    });
    await registerPidFile(tracker, 'personal-aaaaaa', 'aaaaaaaaaaaa', DIR_A);
    writeFileSync(tracker.pidFileFor('personal-aaaaaa', 'aaaaaaaaaaaa'), '201');
    await registerPidFile(tracker, 'work-bbbbbb', 'bbbbbbbbbbbb', DIR_B);
    writeFileSync(tracker.pidFileFor('work-bbbbbb', 'bbbbbbbbbbbb'), '202');

    let runtime = await tracker.snapshot(ids);
    expect(runtime['personal-aaaaaa']?.map((i) => [i.pid, i.state, i.configDirectory])).toEqual([
      [201, 'running', 'verified'],
    ]);
    expect(runtime['work-bbbbbb']?.map((i) => [i.pid, i.state, i.configDirectory])).toEqual([
      [202, 'running', 'verified'],
    ]);

    delete processes.table[201]; // the user closed Personal
    runtime = await tracker.snapshot(ids);
    expect(runtime['personal-aaaaaa']).toBeUndefined();
    expect(runtime['work-bbbbbb']?.[0]).toMatchObject({ pid: 202, state: 'running' });
    expect(readdirSync(runtimeDir).filter((f) => f.startsWith('personal-'))).toEqual([]);
  });

  it('treats a reused PID (different program) as unconfirmed, not running', async () => {
    const { tracker } = setup({ 301: { commandLine: '/usr/bin/vim notes.txt' } });
    await registerPidFile(tracker, 'personal-aaaaaa', 'aaaaaaaaaaaa', DIR_A);
    writeFileSync(tracker.pidFileFor('personal-aaaaaa', 'aaaaaaaaaaaa'), '301');
    clock = new Date(clock.getTime() + 60_000);
    expect((await tracker.snapshot(ids))['personal-aaaaaa']?.[0]?.state).toBe('unconfirmed');
  });

  it('uses the held process handle for directly started processes, including exits reported early', async () => {
    const { tracker } = setup({ 401: { commandLine: 'claude.exe' } }, 'win32');
    await tracker.register({
      launchId: 'cccccccccccc',
      profileId: 'work-bbbbbb',
      tracking: 'child',
      pid: 401,
      executable: 'C:\\x\\claude.exe',
      marker: null,
      expectedEnv: {},
    });
    expect((await tracker.snapshot(ids))['work-bbbbbb']?.[0]).toMatchObject({
      state: 'running',
      pid: 401,
    });
    tracker.markExited('cccccccccccc');
    expect((await tracker.snapshot(ids))['work-bbbbbb']).toBeUndefined();

    tracker.markExited('dddddddddddd');
    await tracker.register({
      launchId: 'dddddddddddd',
      profileId: 'work-bbbbbb',
      tracking: 'child',
      pid: 401,
      executable: 'C:\\x\\claude.exe',
      marker: null,
      expectedEnv: {},
    });
    expect((await tracker.snapshot(ids))['work-bbbbbb']).toBeUndefined();
  });

  it('restores launch records after a restart and re-identifies the process', async () => {
    const table = { 501: { commandLine: EXE, env: { CLAUDE_CONFIG_DIR: DIR_A } } };
    const first = setup(table).tracker;
    await registerPidFile(first, 'personal-aaaaaa', 'aaaaaaaaaaaa', DIR_A);
    writeFileSync(first.pidFileFor('personal-aaaaaa', 'aaaaaaaaaaaa'), '501');
    await first.snapshot(ids);

    const second = setup(table).tracker;
    await second.restore();
    expect((await second.snapshot(ids))['personal-aaaaaa']?.[0]).toMatchObject({
      pid: 501,
      state: 'running',
      configDirectory: 'verified',
    });
  });

  it('discards tampered or invalid records and records of deleted profiles', async () => {
    writeFileSync(
      path.join(runtimeDir, 'evil.json'),
      JSON.stringify({ launchId: '../x', profileId: 'a', pid: -1 }),
    );
    const { tracker } = setup({ 601: { commandLine: EXE } });
    await tracker.restore();
    expect(existsSync(path.join(runtimeDir, 'evil.json'))).toBe(false);

    await registerPidFile(tracker, 'work-bbbbbb', 'eeeeeeeeeeee', DIR_B);
    expect(await tracker.snapshot(new Set(['personal-aaaaaa']))).toEqual({});
    expect(readdirSync(runtimeDir)).toEqual([]);
  });

  it('writes launch records without any credential values', async () => {
    const { tracker } = setup();
    await registerPidFile(tracker, 'personal-aaaaaa', 'aaaaaaaaaaaa', DIR_A);
    const record = readFileSync(path.join(runtimeDir, 'personal-aaaaaa.aaaaaaaaaaaa.json'), 'utf8');
    expect(JSON.parse(record)).toMatchObject({ expectedEnv: { CLAUDE_CONFIG_DIR: DIR_A } });
    expect(record).not.toMatch(/ANTHROPIC|TOKEN|sk-ant/);
  });
});

describe('termination paths', () => {
  it('only the Switch-mode closer can ask another process to quit, and nothing is ever forced', async () => {
    const { readdirSync: readDir, statSync } = await import('node:fs');
    const root = path.resolve(__dirname, '../../src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readDir(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
      }
    };
    walk(root);
    const closer = path.join('main', 'runtime', 'process-closer.ts');
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Nothing anywhere force-kills: no SIGKILL, no `taskkill /F`, no pkill/killall.
      expect(source).not.toMatch(/SIGKILL|pkill|killall|['"]\/F['"]|['"]\/T['"]/);
      if (path.relative(root, file) === closer) {
        const kills = [...source.matchAll(/process\.kill\(([^)]*)\)/g)].map((m) => m[1]);
        expect(kills).toEqual(["pid, 'SIGTERM'"]);
        continue;
      }
      // Everywhere else process.kill is only an existence check (signal 0).
      for (const match of source.matchAll(/process\.kill\(([^)]*)\)/g))
        expect(match[1]).toMatch(/,\s*0$/);
      expect(source).not.toMatch(/taskkill|SIGTERM/);
    }
    // The only `.kill()` is the timeout guard for Profile Switcher's own short-lived helper commands.
    const childKills = files.filter((file) => /child\.kill\(\)/.test(readFileSync(file, 'utf8')));
    expect(childKills.map((f) => path.relative(root, f))).toEqual([path.join('main', 'system.ts')]);
    // The closer is used only by the profile service (Switch mode) and the composition root.
    const users = files
      .filter((file) => /ProcessCloser|createNodeQuitRequester/.test(readFileSync(file, 'utf8')))
      .map((f) => path.relative(root, f))
      .sort();
    expect(users).toEqual(
      [
        closer,
        path.join('main', 'index.ts'),
        path.join('main', 'profiles', 'profile-service.ts'),
      ].sort(),
    );
  });
});

describe('marker tracking (desktop applications)', () => {
  const MAC_EXE = '/Applications/Claude.app';
  const MARKER = '--user-data-dir=/data/profiles/claude-desktop/work-bbbbbb';
  const MAIN = `/Applications/Claude.app/Contents/MacOS/Claude ${MARKER}`;

  async function registerMarker(tracker: ProcessTracker, launchId: string) {
    await tracker.register({
      launchId,
      profileId: 'work-bbbbbb',
      tracking: 'marker',
      pid: null,
      executable: MAC_EXE,
      marker: MARKER,
      expectedEnv: {},
    });
  }

  it('finds the main process by its folder argument and reports the folder as confirmed', async () => {
    const { tracker, processes } = setup({}, 'darwin');
    await registerMarker(tracker, 'eeeeeeeeeeee');
    expect((await tracker.snapshot(ids))['work-bbbbbb']?.[0]?.state).toBe('starting');

    processes.table[700] = { commandLine: `Claude Helper --type=renderer ${MARKER}` };
    processes.table[701] = { commandLine: MAIN };
    expect((await tracker.snapshot(ids))['work-bbbbbb']).toEqual([
      expect.objectContaining({ state: 'running', pid: 701, configDirectory: 'verified' }),
    ]);
    const record = JSON.parse(
      readFileSync(path.join(runtimeDir, 'work-bbbbbb.eeeeeeeeeeee.json'), 'utf8'),
    ) as { pid: number; marker: string };
    expect(record).toMatchObject({ pid: 701, marker: MARKER });

    delete processes.table[701];
    expect((await tracker.snapshot(ids))['work-bbbbbb']).toBeUndefined();
  });

  it('does not call a reused PID running when the process lost the marker', async () => {
    const { tracker, processes } = setup({ 702: { commandLine: MAIN } }, 'darwin');
    await registerMarker(tracker, 'eeeeeeeeeeee');
    expect((await tracker.snapshot(ids))['work-bbbbbb']?.[0]?.state).toBe('running');
    processes.table[702] = { commandLine: '/Applications/Claude.app/Contents/MacOS/Claude' };
    expect((await tracker.snapshot(ids))['work-bbbbbb']?.[0]?.state).toBe('starting');
  });

  it('lists a repeated launch handed to the running instance only once', async () => {
    const { tracker } = setup({ 703: { commandLine: MAIN } }, 'darwin');
    await registerMarker(tracker, 'eeeeeeeeeeee');
    clock = new Date(clock.getTime() + 1000);
    await registerMarker(tracker, 'ffffffffffff');
    const instances = (await tracker.snapshot(ids))['work-bbbbbb'] ?? [];
    expect(instances.map((i) => i.launchId)).toEqual(['eeeeeeeeeeee']);
  });

  it('becomes unconfirmed when no matching process appears', async () => {
    const { tracker } = setup({}, 'win32');
    await registerMarker(tracker, 'eeeeeeeeeeee');
    clock = new Date(clock.getTime() + 60_000);
    expect((await tracker.snapshot(ids))['work-bbbbbb']?.[0]?.state).toBe('unconfirmed');
    clock = new Date(clock.getTime() + 10 * 60_000);
    expect((await tracker.snapshot(ids))['work-bbbbbb']).toBeUndefined();
  });

  it('restores 0.1.x launch records that have no marker field', async () => {
    writeFileSync(
      path.join(runtimeDir, 'personal-aaaaaa.aaaaaaaaaaaa.json'),
      JSON.stringify({
        launchId: 'aaaaaaaaaaaa',
        profileId: 'personal-aaaaaa',
        startedAt: clock.toISOString(),
        tracking: 'pid-file',
        pid: 900,
        executable: EXE,
        expectedEnv: { CLAUDE_CONFIG_DIR: DIR_A },
      }),
    );
    const { tracker } = setup({ 900: { commandLine: EXE, env: { CLAUDE_CONFIG_DIR: DIR_A } } });
    await tracker.restore();
    expect((await tracker.snapshot(ids))['personal-aaaaaa']?.[0]).toMatchObject({
      state: 'running',
      pid: 900,
    });
  });

  it('re-checks a single launch on request', async () => {
    const { tracker } = setup({ 704: { commandLine: MAIN } }, 'darwin');
    await registerMarker(tracker, 'eeeeeeeeeeee');
    expect(await tracker.status('eeeeeeeeeeee')).toMatchObject({
      profileId: 'work-bbbbbb',
      status: { state: 'running', pid: 704 },
    });
    expect(await tracker.status('000000000000')).toBeNull();
  });
});
