import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

/**
 * Primary workflow, end to end, against the built application:
 * create Personal and Work, confirm distinct metadata and directories,
 * inspect compatibility, verify, launch Personal and then Work so both run
 * at the same time, confirm each uses its own folder and sign-in, close them
 * independently, restart, and confirm persistence.
 *
 * Linux only: it relies on the x-terminal-emulator launch path and the POSIX
 * stand-in executables in tests/e2e/fixtures/bin. The stand-in Claude Code
 * stays running like an interactive session (PS_FAKE_CLAUDE_HOLD) and
 * "signs in" by writing an account file into its own configuration folder.
 */
test.skip(process.platform !== 'linux', 'End-to-end launch path is exercised on Linux');

const repoRoot = path.resolve(__dirname, '../..');
const fixturesBin = path.join(repoRoot, 'tests/e2e/fixtures/bin');
const screenshotDir = path.join(repoRoot, 'test-results/screenshots');

interface StoredProfile {
  id: string;
  name: string;
  appId: string;
  storage: { kind: string };
  lastLaunch: { outcome: string } | null;
}

let workDir: string;
let dataDir: string;
let homeDir: string;
let recordFile: string;

function readMetadata(): { profiles: StoredProfile[]; lastLaunchedProfileId: string | null } {
  return JSON.parse(readFileSync(path.join(dataDir, 'metadata.json'), 'utf8'));
}

function profileDir(profile: StoredProfile): string {
  return path.join(dataDir, 'profiles', profile.appId, profile.id);
}

async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [repoRoot, '--no-sandbox'],
    env: {
      PATH: `${fixturesBin}:/usr/bin:/bin`,
      HOME: homeDir,
      DISPLAY: process.env.DISPLAY ?? '',
      XAUTHORITY: process.env.XAUTHORITY ?? '',
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? '',
      PROFILE_SWITCHER_DATA_DIR: dataDir,
      PS_E2E_RECORD_FILE: recordFile,
      PS_FAKE_CLAUDE_HOLD: '1',
      // Present in Profile Switcher's environment; must NOT reach launched profiles.
      ANTHROPIC_API_KEY: 'sk-ant-e2e-placeholder-not-a-real-key',
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

test.beforeAll(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), 'profile-switcher-e2e-'));
  dataDir = path.join(workDir, 'data');
  homeDir = path.join(workDir, 'home');
  recordFile = path.join(workDir, 'launches.jsonl');
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });
});

interface LaunchRecord {
  pid: number;
  configDir: string;
  apiKeyPresent: boolean;
  cwd: string;
}

function launchRecords(): LaunchRecord[] {
  if (!existsSync(recordFile)) return [];
  return readFileSync(recordFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LaunchRecord);
}

/** Targets of a process's open file descriptors above stderr. */
function inheritedDescriptors(pid: number): string[] {
  return readdirSync(`/proc/${pid}/fd`)
    .filter((fd) => Number(fd) > 2)
    .map((fd) => {
      try {
        return readlinkSync(`/proc/${pid}/fd/${fd}`);
      } catch {
        return '';
      }
    });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test.afterAll(() => {
  for (const record of launchRecords()) {
    try {
      process.kill(record.pid);
    } catch {
      // already closed
    }
  }
  rmSync(workDir, { recursive: true, force: true });
});

test('create, inspect, verify, launch, and persist profiles', async () => {
  let { app, page } = await launchApp();

  // 1. First run: templates.
  await expect(page.getByRole('heading', { name: 'Set up your first profiles' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'first-run.png') });
  await page.getByRole('button', { name: 'Create Personal and Work' }).click();

  const cards = page.getByTestId('profile-card');
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Personal', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Work', level: 3 })).toBeVisible();
  await expect(cards.first().getByText('Isolated')).toBeVisible();

  // 2. Distinct metadata and configuration directories.
  let metadata = readMetadata();
  expect(metadata.profiles).toHaveLength(2);
  const [personal, work] = ['Personal', 'Work'].map((name) =>
    metadata.profiles.find((p) => p.name === name)!,
  );
  expect(personal!.id).not.toEqual(work!.id);
  expect(personal!.storage.kind).toBe('managed');
  expect(existsSync(profileDir(personal!))).toBe(true);
  expect(existsSync(profileDir(work!))).toBe(true);
  expect(profileDir(personal!)).not.toEqual(profileDir(work!));

  // 3. Compatibility details and verification for Work.
  await page.getByRole('button', { name: 'Details: Work' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('What is guaranteed')).toBeVisible();
  await expect(dialog.getByText('What is not guaranteed')).toBeVisible();
  await expect(dialog.getByText(profileDir(work!))).toBeVisible();
  await dialog.getByRole('button', { name: 'Verify' }).click();
  await expect(
    dialog.getByText('Configuration isolation confirmed', { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByText('Removed for this launch: ANTHROPIC_API_KEY')).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'profile-details.png') });
  await dialog.getByRole('button', { name: 'Close' }).first().click();

  // 4. Launch Personal; it is shown as running only once its process is confirmed.
  const cardFor = (name: string) =>
    cards.filter({ has: page.getByRole('heading', { name, level: 3 }) });
  const personalCard = cardFor('Personal');
  const workCard = cardFor('Work');
  await personalCard.getByRole('button', { name: 'Launch' }).click();
  await expect(page.getByText('Launched "Personal"', { exact: false })).toBeVisible();
  await expect(personalCard.getByTestId('runtime-indicator')).toHaveText(
    /Running · folder confirmed/,
    { timeout: 20_000 },
  );

  // 5. Launch Work WITHOUT closing Personal; both run at the same time.
  await workCard.getByRole('button', { name: 'Launch' }).click();
  await expect(workCard.getByTestId('runtime-indicator')).toHaveText(/Running · folder confirmed/, {
    timeout: 20_000,
  });
  await expect(personalCard.getByTestId('runtime-indicator')).toHaveText(/Running/);

  const records = launchRecords();
  expect(records).toHaveLength(2);
  const personalRecord = records.find((r) => r.configDir === profileDir(personal!))!;
  const workRecord = records.find((r) => r.configDir === profileDir(work!))!;
  expect(personalRecord).toBeDefined();
  expect(workRecord).toBeDefined();
  expect(personalRecord.pid).not.toBe(workRecord.pid);
  expect(isAlive(personalRecord.pid)).toBe(true);
  expect(isAlive(workRecord.pid)).toBe(true);
  for (const record of records) {
    expect(record.apiKeyPresent).toBe(false);
    expect(record.cwd).toBe(homeDir);
    // No Electron/Chromium descriptors (IPC sockets, storage locks, caches) leak into launched profiles.
    const descriptors = inheritedDescriptors(record.pid);
    expect(
      descriptors.filter((target) => /socket:|pipe:|chromium|electron|anon_inode/i.test(target)),
    ).toEqual([]);
  }
  await page.screenshot({ path: path.join(screenshotDir, 'dashboard.png') });

  // 6. Each profile reports its own sign-in; signing in to Work did not sign Personal out.
  for (const [name, email] of [
    ['Personal', 'personal@example.test'],
    ['Work', 'work@example.test'],
  ] as const) {
    await page.getByRole('button', { name: `Details: ${name}` }).click();
    const details = page.getByRole('dialog');
    await details.getByRole('button', { name: 'Verify' }).click();
    await expect(details.getByText(email)).toBeVisible();
    await expect(
      details.getByText('Configuration isolation confirmed', { exact: false }),
    ).toBeVisible();
    await expect(details.getByText('Folder confirmed from the running process')).toBeVisible();
    if (name === 'Work')
      await page.screenshot({ path: path.join(screenshotDir, 'profile-details-running.png') });
    await details.getByRole('button', { name: 'Close' }).first().click();
  }

  metadata = readMetadata();
  expect(metadata.lastLaunchedProfileId).toBe(work!.id);

  // 7. Close Personal on its own (as the user closing its window); Work keeps running.
  writeFileSync(path.join(profileDir(personal!), '.fake-stop'), '');
  await expect(personalCard.getByTestId('runtime-indicator')).toHaveCount(0, { timeout: 20_000 });
  await expect(workCard.getByTestId('runtime-indicator')).toHaveText(/Running/);
  expect(isAlive(workRecord.pid)).toBe(true);

  // 8. Restart Profile Switcher: profiles persist and the still-running Work is recognized.
  await app.close();
  expect(isAlive(workRecord.pid)).toBe(true);
  ({ app, page } = await launchApp());
  await expect(page.getByTestId('profile-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Personal', level: 3 })).toBeVisible();
  await expect(page.getByText('Last launched', { exact: false }).first()).toBeVisible();
  const restartedWork = page
    .getByTestId('profile-card')
    .filter({ has: page.getByRole('heading', { name: 'Work', level: 3 }) });
  await expect(restartedWork.getByTestId('runtime-indicator')).toHaveText(/Running/, {
    timeout: 20_000,
  });
  writeFileSync(path.join(profileDir(work!), '.fake-stop'), '');
  await expect(restartedWork.getByTestId('runtime-indicator')).toHaveCount(0, { timeout: 20_000 });

  // 9. Deleting a profile keeps its folder (and the sign-in stored there) on disk.
  await page.getByRole('button', { name: 'Delete: Work' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText('is NOT deleted', { exact: false })).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete profile' }).click();
  await expect(page.getByTestId('profile-card')).toHaveCount(1);
  expect(existsSync(profileDir(work!))).toBe(true);
  expect(existsSync(path.join(profileDir(work!), '.fake-account.json'))).toBe(true);
  expect(readMetadata().profiles.map((p) => p.name)).toEqual(['Personal']);

  // 10. Settings and diagnostics render real data.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'settings.png') });
  await page.getByRole('button', { name: 'Diagnostics' }).click();
  const diagnostics = page.getByLabel('Diagnostics');
  await expect(diagnostics).toContainText('claude-code: found v2.1.0');
  await expect(diagnostics).not.toContainText('sk-ant-');
  await expect(diagnostics).not.toContainText('Personal');

  await app.close();
});
