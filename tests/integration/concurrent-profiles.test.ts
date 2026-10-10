import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/main/adapters/registry';
import { Launcher } from '../../src/main/launch/launcher';
import { resolveAppPaths, type AppPaths } from '../../src/main/paths';
import { ProfileService } from '../../src/main/profiles/profile-service';
import { createNodeQuitRequester, ProcessCloser } from '../../src/main/runtime/process-closer';
import { ProcessTracker } from '../../src/main/runtime/process-tracker';
import { MetadataStore } from '../../src/main/storage/metadata-store';
import { createNodeSystemContext, type SystemContext } from '../../src/main/system';
import { createProfileInputSchema } from '../../src/shared/domain/profile';
import type { InstanceStatus, RuntimeSnapshot } from '../../src/shared/ipc';
import { nullLogger } from '../helpers/fake-system';

/**
 * Concurrent multi-profile execution, with real processes (Linux).
 *
 * Uses the production ProfileService, Launcher, and ProcessTracker. Only the
 * terminal emulator and Claude Code are stand-ins (tests/e2e/fixtures/bin):
 * the stand-in Claude Code stays running like an interactive session and
 * "signs in" by writing an account file into its own configuration folder.
 */
const fixturesBin = path.resolve(__dirname, '../e2e/fixtures/bin');

let root: string;
let paths: AppPaths;
let system: SystemContext;
const spawnedPids = new Set<number>();

async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  what: string,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function hashDirectory(dir: string): string {
  const hash = createHash('sha256');
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    hash.update(`${entry}:${stat.size}:${stat.mtimeMs}:`);
    if (stat.isFile()) hash.update(readFileSync(full));
  }
  return hash.digest('hex');
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function service() {
  const svc = new ProfileService({
    store: new MetadataStore({ filePath: paths.metadataFile, logger: nullLogger }),
    registry: createDefaultRegistry(),
    system,
    paths,
    launcher: new Launcher(system, paths.launchersDir, nullLogger),
    tracker: new ProcessTracker(system, paths.runtimeDir, nullLogger),
    closer: new ProcessCloser({
      requestQuit: createNodeQuitRequester(system.platform, system.runner),
      processes: system.processes,
      logger: nullLogger,
    }),
    logger: nullLogger,
    randomBytes: (n) => randomBytes(n),
    appInfo: {
      name: 'Profile Switcher',
      version: '0.0.0-test',
      appId: 'test',
      electron: '0',
      chrome: '0',
      node: '0',
    },
  });
  await svc.initialize();
  await svc.updateSettings({ preferredTerminal: 'x-terminal-emulator' });
  return svc;
}

function running(runtime: RuntimeSnapshot, profileId: string): InstanceStatus[] {
  return (runtime[profileId] ?? []).filter((instance) => instance.state === 'running');
}

describe.runIf(process.platform === 'linux')('concurrent profiles (real processes, Linux)', () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'ps-concurrent-'));
    const home = path.join(root, 'home');
    mkdirSync(home);
    paths = resolveAppPaths({
      platform: 'linux',
      homeDir: home,
      env: { PROFILE_SWITCHER_DATA_DIR: path.join(root, 'data') },
    });
    system = {
      ...createNodeSystemContext(),
      homeDir: home,
      env: {
        PATH: `${fixturesBin}:/usr/bin:/bin`,
        HOME: home,
        PS_FAKE_CLAUDE_HOLD: '1',
        ANTHROPIC_API_KEY: 'sk-ant-must-not-reach-profiles',
      },
    };
  });

  afterEach(() => {
    for (const pid of spawnedPids) {
      try {
        process.kill(pid);
      } catch {
        // already exited
      }
    }
    spawnedPids.clear();
    rmSync(root, { recursive: true, force: true });
  });

  it('runs Personal and Work at the same time, isolated, and closes them independently', async () => {
    const svc = await service();
    const make = (name: string) =>
      svc.create(
        createProfileInputSchema.parse({
          name,
          appId: 'claude-code',
          color: 'blue',
          storage: { kind: 'managed' },
        }),
      );
    const personal = await make('Personal');
    const work = await make('Work');
    const snapshot = await svc.snapshot();
    const dirOf = (id: string) => snapshot.profiles.find((p) => p.id === id)!.dataDirectory!;

    // 1. Launch Personal and wait until it is confirmed running with its own folder.
    await svc.launch(personal);
    const [personalInstance] = await waitFor(async () => {
      const instances = running(await svc.runtime(), personal);
      return instances.length === 1 ? instances : undefined;
    }, 'Personal to run');
    expect(personalInstance!.configDirectory).toBe('verified');
    spawnedPids.add(personalInstance!.pid!);
    await waitFor(
      async () => ((await svc.verify(personal)).loggedIn ? true : undefined),
      'Personal sign-in',
    );
    const personalBefore = hashDirectory(dirOf(personal));

    // 2. Launch Work without closing Personal.
    await svc.launch(work);
    const [workInstance] = await waitFor(async () => {
      const instances = running(await svc.runtime(), work);
      return instances.length === 1 ? instances : undefined;
    }, 'Work to run');
    spawnedPids.add(workInstance!.pid!);
    expect(workInstance!.configDirectory).toBe('verified');
    expect(workInstance!.pid).not.toBe(personalInstance!.pid);
    await waitFor(
      async () => ((await svc.verify(work)).loggedIn ? true : undefined),
      'Work sign-in',
    );

    // 3. Both are running; Personal was neither terminated nor modified.
    const both = await svc.runtime();
    expect(running(both, personal).map((i) => i.pid)).toEqual([personalInstance!.pid]);
    expect(running(both, work).map((i) => i.pid)).toEqual([workInstance!.pid]);
    expect(isAlive(personalInstance!.pid!)).toBe(true);
    expect(hashDirectory(dirOf(personal))).toBe(personalBefore);

    // 4. Signing in to Work did not sign Personal out, and each reports its own account.
    const [personalStatus, workStatus] = [await svc.verify(personal), await svc.verify(work)];
    expect(personalStatus).toMatchObject({
      loggedIn: true,
      configDirectoryMatches: true,
      account: { email: 'personal@example.test' },
    });
    expect(workStatus).toMatchObject({
      loggedIn: true,
      configDirectoryMatches: true,
      account: { email: 'work@example.test' },
    });

    // 5. Each process received only its own folder, and no credential variable.
    for (const [id, instance] of [
      [personal, personalInstance!],
      [work, workInstance!],
    ] as const) {
      const environ = readFileSync(`/proc/${instance.pid}/environ`, 'utf8').split('\0');
      expect(environ).toContain(`CLAUDE_CONFIG_DIR=${dirOf(id)}`);
      expect(environ.some((entry) => entry.startsWith('ANTHROPIC_API_KEY='))).toBe(false);
    }

    // 6. Close Personal (as a user closing its window); Work keeps running.
    writeFileSync(path.join(dirOf(personal), '.fake-stop'), '');
    await waitFor(
      async () => (running(await svc.runtime(), personal).length === 0 ? true : undefined),
      'Personal to exit',
    );
    const afterClose = await svc.runtime();
    expect(running(afterClose, work).map((i) => i.pid)).toEqual([workInstance!.pid]);
    expect(isAlive(workInstance!.pid!)).toBe(true);
    expect((await svc.verify(work)).loggedIn).toBe(true);

    // 7. Close Work as well.
    writeFileSync(path.join(dirOf(work), '.fake-stop'), '');
    await waitFor(
      async () => (Object.keys(await svc.runtime()).length === 0 ? true : undefined),
      'Work to exit',
    );
  }, 60_000);

  it('allows several instances of the same profile and keeps them while another profile launches', async () => {
    const svc = await service();
    const id = await svc.create(
      createProfileInputSchema.parse({
        name: 'Work',
        appId: 'claude-code',
        color: 'blue',
        storage: { kind: 'managed' },
      }),
    );
    const other = await svc.create(
      createProfileInputSchema.parse({
        name: 'Other',
        appId: 'claude-code',
        color: 'teal',
        storage: { kind: 'managed' },
      }),
    );
    await svc.launch(id);
    await svc.launch(id);
    const instances = await waitFor(async () => {
      const list = running(await svc.runtime(), id);
      return list.length === 2 ? list : undefined;
    }, 'two Work instances');
    instances.forEach((i) => spawnedPids.add(i.pid!));
    expect(new Set(instances.map((i) => i.pid)).size).toBe(2);

    await svc.launch(other);
    const [otherInstance] = await waitFor(async () => {
      const list = running(await svc.runtime(), other);
      return list.length === 1 ? list : undefined;
    }, 'Other to run');
    spawnedPids.add(otherInstance!.pid!);
    expect(running(await svc.runtime(), id)).toHaveLength(2);
    expect(instances.every((i) => isAlive(i.pid!))).toBe(true);
  }, 60_000);

  it('survives a Profile Switcher restart without losing track of running profiles', async () => {
    const svc = await service();
    const id = await svc.create(
      createProfileInputSchema.parse({
        name: 'Personal',
        appId: 'claude-code',
        color: 'blue',
        storage: { kind: 'managed' },
      }),
    );
    await svc.launch(id);
    const [instance] = await waitFor(async () => {
      const list = running(await svc.runtime(), id);
      return list.length === 1 ? list : undefined;
    }, 'Personal to run');
    spawnedPids.add(instance!.pid!);

    const restarted = await service();
    expect(running(await restarted.runtime(), id)).toEqual([
      expect.objectContaining({ pid: instance!.pid, configDirectory: 'verified' }),
    ]);
  }, 60_000);

  it('Switch mode closes the confirmed profile with a normal quit request, then launches the other', async () => {
    const svc = await service();
    await svc.updateSettings({ launchModes: { 'claude-code': 'switch' } });
    const make = (name: string) =>
      svc.create(
        createProfileInputSchema.parse({
          name,
          appId: 'claude-code',
          color: 'blue',
          storage: { kind: 'managed' },
        }),
      );
    const personal = await make('Personal');
    const work = await make('Work');
    const dirOf = async (id: string) =>
      (await svc.snapshot()).profiles.find((p) => p.id === id)!.dataDirectory!;

    await svc.launch(personal);
    const [personalInstance] = await waitFor(async () => {
      const list = running(await svc.runtime(), personal);
      return list.length === 1 ? list : undefined;
    }, 'Personal to run');
    spawnedPids.add(personalInstance!.pid!);
    await waitFor(
      async () => ((await svc.verify(personal)).loggedIn ? true : undefined),
      'Personal sign-in',
    );
    const personalBefore = hashDirectory(await dirOf(personal));

    // Without a decision nothing happens: Personal keeps running, Work is not started.
    const prompt = await svc.launch(work);
    expect(prompt).toEqual({
      kind: 'confirm-switch',
      running: [
        { profileId: personal, launchId: personalInstance!.launchId, pid: personalInstance!.pid },
      ],
      untrackedProfileIds: [],
    });
    expect(isAlive(personalInstance!.pid!)).toBe(true);
    expect(running(await svc.runtime(), work)).toEqual([]);

    // The user confirms: Personal is asked to quit (SIGTERM), exits, and Work starts.
    const outcome = await svc.launch(work, {
      switch: { action: 'close', launchIds: [personalInstance!.launchId] },
    });
    expect(outcome).toMatchObject({ kind: 'launched', report: { closedProfileIds: [personal] } });
    expect(isAlive(personalInstance!.pid!)).toBe(false);
    const [workInstance] = await waitFor(async () => {
      const list = running(await svc.runtime(), work);
      return list.length === 1 ? list : undefined;
    }, 'Work to run');
    spawnedPids.add(workInstance!.pid!);
    expect(workInstance!.configDirectory).toBe('verified');

    // Closing Personal did not change its folder: its sign-in is still there for next time.
    expect(hashDirectory(await dirOf(personal))).toBe(personalBefore);
    expect((await svc.verify(personal)).loggedIn).toBe(true);
  }, 60_000);

  it.each([
    {
      appId: 'codex-cli',
      variable: 'CODEX_HOME',
      credential: 'OPENAI_API_KEY',
      signIn: 'auth.json',
    },
    {
      appId: 'gemini-cli',
      variable: 'GEMINI_CLI_HOME',
      credential: 'GEMINI_API_KEY',
      signIn: '.gemini/oauth_creds.json',
    },
  ])(
    '$appId: two profiles run side by side, each with only its own folder',
    async ({ appId, variable, credential, signIn }) => {
      system = { ...system, env: { ...system.env, [credential]: 'must-not-reach-profiles' } };
      const svc = await service();
      const make = (name: string) =>
        svc.create(
          createProfileInputSchema.parse({
            name,
            appId,
            color: 'blue',
            storage: { kind: 'managed' },
          }),
        );
      const personal = await make('Personal');
      const work = await make('Work');
      const snapshot = await svc.snapshot();
      expect(snapshot.profiles.every((p) => p.compatibility.state === 'Supported')).toBe(true);
      const dirOf = (id: string) => snapshot.profiles.find((p) => p.id === id)!.dataDirectory!;

      await svc.launch(personal);
      await svc.launch(work);
      for (const id of [personal, work]) {
        const [instance] = await waitFor(async () => {
          const list = running(await svc.runtime(), id);
          return list.length === 1 ? list : undefined;
        }, `${id} to run`);
        spawnedPids.add(instance!.pid!);
        expect(instance!.configDirectory).toBe('verified');
        const environ = readFileSync(`/proc/${instance!.pid}/environ`, 'utf8').split('\0');
        expect(environ).toContain(`${variable}=${dirOf(id)}`);
        expect(environ.some((entry) => entry.startsWith(`${credential}=`))).toBe(false);
        // The stand-in "signs in" inside its own folder only.
        await waitFor(
          async () => (existsSync(path.join(dirOf(id), signIn)) ? true : undefined),
          `${id} sign-in`,
        );
      }
      expect(existsSync(path.join(system.homeDir, '.codex'))).toBe(false);
      expect(existsSync(path.join(system.homeDir, '.gemini'))).toBe(false);

      if (appId === 'codex-cli') {
        expect(await svc.verify(personal)).toMatchObject({
          loggedIn: true,
          authMethod: 'ChatGPT',
          configDirectoryMatches: null,
        });
      }
      for (const id of [personal, work]) writeFileSync(path.join(dirOf(id), '.fake-stop'), '');
      await waitFor(
        async () => (Object.keys(await svc.runtime()).length === 0 ? true : undefined),
        'both to exit',
      );
    },
    60_000,
  );

  it("opens each profile's sign-in page in its own browser profile", async () => {
    const browserLog = path.join(root, 'browser.jsonl');
    system = {
      ...system,
      env: {
        ...system.env,
        PS_FAKE_OPEN_URL: 'https://claude.ai/oauth/authorize?test=1',
        PS_E2E_BROWSER_FILE: browserLog,
      },
    };
    const svc = await service();
    // Pin the browser: CI machines have real browsers and their own default.
    await svc.updateSettings({ signInBrowser: 'chrome' });
    expect((await svc.snapshot()).environment.browsers.resolved).toEqual({
      id: 'chrome',
      name: 'Google Chrome',
    });
    const make = (name: string) =>
      svc.create(
        createProfileInputSchema.parse({
          name,
          appId: 'claude-code',
          color: 'blue',
          storage: { kind: 'managed' },
        }),
      );
    const personal = await make('Personal');
    const work = await make('Work');
    await svc.launch(personal);
    await svc.launch(work);
    const opened = await waitFor(async () => {
      if (!existsSync(browserLog)) return undefined;
      const lines = readFileSync(browserLog, 'utf8').trim().split('\n').filter(Boolean);
      return lines.length === 2 ? lines.map((l) => JSON.parse(l) as string[]) : undefined;
    }, 'both sign-in pages');
    for (const id of [personal, work]) {
      const [instance] = running(await svc.runtime(), id);
      if (instance?.pid) spawnedPids.add(instance.pid);
    }
    const dirs = opened.map((args) => args.find((a) => a.startsWith('--user-data-dir='))).sort();
    expect(dirs).toEqual(
      [personal, work]
        .map((id) => `--user-data-dir=${path.join(paths.profilesRoot, '_browser', id)}`)
        .sort(),
    );
    expect(opened.every((args) => args.at(-1) === 'https://claude.ai/oauth/authorize?test=1')).toBe(
      true,
    );

    // "Off" leaves Claude Code's normal browser behavior.
    await svc.updateSettings({ signInBrowser: 'off' });
    expect((await svc.snapshot()).environment.browsers.resolved).toBeNull();
    for (const id of [personal, work]) {
      const dir = (await svc.snapshot()).profiles.find((p) => p.id === id)!.dataDirectory!;
      writeFileSync(path.join(dir, '.fake-stop'), '');
    }
  }, 60_000);
});
