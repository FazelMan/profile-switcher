import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
 * Switch mode and the Persian interface, end to end, against the built app
 * (Linux; same stand-in executables as primary-workflow.spec.ts).
 *
 * Switch mode: with Personal running, launching Work asks first; choosing
 * "Close and open" asks Personal to quit (SIGTERM), waits for it to exit, and
 * only then starts Work. Personal's folder and sign-in stay intact.
 */
test.skip(process.platform !== 'linux', 'End-to-end launch path is exercised on Linux');

const repoRoot = path.resolve(__dirname, '../..');
const fixturesBin = path.join(repoRoot, 'tests/e2e/fixtures/bin');
const screenshotDir = path.join(repoRoot, 'test-results/screenshots');

let workDir: string;
let dataDir: string;
let homeDir: string;
let recordFile: string;

interface StoredProfile {
  id: string;
  name: string;
  appId: string;
}

function readMetadata(): {
  profiles: StoredProfile[];
  settings: { language: string; launchModes: Record<string, string> };
} {
  return JSON.parse(readFileSync(path.join(dataDir, 'metadata.json'), 'utf8'));
}

function launchRecords(): Array<{ pid: number; configDir: string }> {
  if (!existsSync(recordFile)) return [];
  return readFileSync(recordFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { pid: number; configDir: string });
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function launchApp(lang: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [repoRoot, '--no-sandbox'],
    env: {
      PATH: `${fixturesBin}:/usr/bin:/bin`,
      HOME: homeDir,
      DISPLAY: process.env.DISPLAY ?? '',
      XAUTHORITY: process.env.XAUTHORITY ?? '',
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? '',
      LANG: `${lang}.UTF-8`,
      LANGUAGE: lang,
      PROFILE_SWITCHER_DATA_DIR: dataDir,
      PS_E2E_RECORD_FILE: recordFile,
      PS_FAKE_CLAUDE_HOLD: '1',
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

test.beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), 'profile-switcher-e2e-switch-'));
  dataDir = path.join(workDir, 'data');
  homeDir = path.join(workDir, 'home');
  recordFile = path.join(workDir, 'launches.jsonl');
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });
});

test.afterEach(() => {
  for (const record of launchRecords()) {
    try {
      process.kill(record.pid);
    } catch {
      // already closed
    }
  }
  rmSync(workDir, { recursive: true, force: true });
});

test('Switch mode closes the running profile only after confirmation', async () => {
  const { app, page } = await launchApp('en_US');
  await page.getByRole('button', { name: 'Create Personal and Work' }).click();
  const cards = page.getByTestId('profile-card');
  await expect(cards).toHaveCount(2);

  await page.getByRole('button', { name: 'Settings' }).click();
  const claudeCode = page.getByRole('group', { name: 'Claude Code' });
  // A controlled radio: it shows the saved value once the main process confirms.
  await claudeCode.getByRole('radio', { name: /Switch/ }).click();
  await expect(claudeCode.getByRole('radio', { name: /Switch/ })).toBeChecked();
  await expect.poll(() => readMetadata().settings.launchModes['claude-code']).toBe('switch');
  await page.getByRole('button', { name: 'Profiles' }).click();

  const cardFor = (name: string) =>
    cards.filter({ has: page.getByRole('heading', { name, level: 3 }) });
  await cardFor('Personal').getByRole('button', { name: 'Launch' }).click();
  await expect(cardFor('Personal').getByTestId('runtime-indicator')).toHaveText(/Running/, {
    timeout: 20_000,
  });
  const [personalRecord] = launchRecords();
  expect(isAlive(personalRecord!.pid)).toBe(true);

  // Launching Work asks first; cancelling changes nothing.
  await cardFor('Work').getByRole('button', { name: 'Launch' }).click();
  let dialog = page.getByRole('dialog', { name: 'Switch to "Work"?' });
  await expect(dialog.getByTestId('switch-list')).toContainText(
    `Personal · PID ${personalRecord!.pid}`,
  );
  await page.screenshot({ path: path.join(screenshotDir, 'switch-confirm.png') });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(isAlive(personalRecord!.pid)).toBe(true);
  expect(launchRecords()).toHaveLength(1);

  // Confirming closes Personal (normal quit request), then opens Work.
  await cardFor('Work').getByRole('button', { name: 'Launch' }).click();
  dialog = page.getByRole('dialog', { name: 'Switch to "Work"?' });
  await dialog.getByRole('button', { name: 'Close and open "Work"' }).click();
  await expect(page.getByText('Closed Personal and opened "Work".')).toBeVisible();
  await expect.poll(() => isAlive(personalRecord!.pid)).toBe(false);
  await expect(cardFor('Work').getByTestId('runtime-indicator')).toHaveText(/Running/, {
    timeout: 20_000,
  });
  await expect(cardFor('Personal').getByTestId('runtime-indicator')).toHaveCount(0, {
    timeout: 20_000,
  });

  // Personal's sign-in is still in its folder for next time.
  const personal = readMetadata().profiles.find((p) => p.name === 'Personal')!;
  expect(
    existsSync(path.join(dataDir, 'profiles', 'claude-code', personal.id, '.fake-account.json')),
  ).toBe(true);
  await app.close();
});

test('a Persian system starts in Persian, right to left, and English can be chosen', async () => {
  const { app, page } = await launchApp('fa_IR');
  await expect(
    page.getByRole('heading', { name: 'نخستین پروفایل‌هایتان را بسازید' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa-IR');
  expect(readMetadata().settings.language).toBe('fa');
  await page.getByRole('button', { name: 'ساخت «شخصی» و «کاری»' }).click();
  await expect(page.getByTestId('profile-card')).toHaveCount(2);
  // The Persian typeface is bundled, so text renders even without system Persian fonts.
  const loadedFaces = await page.evaluate(
    `document.fonts.load('16px "Vazirmatn Variable"', 'پروفایل').then((faces) => faces.length)`,
  );
  expect(loadedFaces).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(screenshotDir, 'dashboard-fa.png') });

  await page.getByRole('button', { name: 'تنظیمات' }).click();
  await expect(page.getByRole('heading', { name: 'اجرای چند پروفایل' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'settings-fa.png'), fullPage: true });
  await page.getByLabel('زبان').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await app.close();

  // The choice persists across restarts, whatever the OS language.
  const restarted = await launchApp('fa_IR');
  await expect(restarted.page.getByRole('heading', { name: 'Profiles', level: 1 })).toBeVisible();
  await restarted.app.close();
});
