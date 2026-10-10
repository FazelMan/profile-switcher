import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the built Electron app (`npm run build` first).
 * They use stand-in executables from tests/e2e/fixtures/bin and never require
 * a real Claude installation, account, or network access.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
});
