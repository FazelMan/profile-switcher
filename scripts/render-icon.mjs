// Renders build/icon.svg to the PNG sizes electron-builder needs, using the
// Chromium that Playwright provides. Run with `npm run icons`.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'build/icon.svg'), 'utf8');

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
try {
  for (const size of [1024, 512, 256]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="width:${size}px;height:${size}px" `)}</body></html>`,
    );
    const png = await page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    const name = size === 1024 ? 'icon.png' : `icon-${size}.png`;
    await writeFile(path.join(root, 'build', name), png);
    await page.close();
    console.warn(`wrote build/${name}`);
  }
} finally {
  await browser.close();
}
