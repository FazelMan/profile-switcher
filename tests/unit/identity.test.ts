import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import identity from '../../src/shared/app-identity.json';

const root = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory()
      ? sourceFiles(full)
      : /\.(ts|tsx|cjs|mjs)$/.test(entry)
        ? [full]
        : [];
  });
}

describe('application identity', () => {
  it('keeps package metadata consistent with the shared identity file', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.productName).toBe(identity.productName);
    expect(pkg.name).toBe(identity.slug);
    expect(pkg.desktopName).toBe(`${identity.slug}.desktop`);
    expect(pkg.homepage).toBe(identity.repositoryUrl);
  });

  it('is not hard-coded anywhere else in source or build configuration', () => {
    const files = [
      ...sourceFiles(path.join(root, 'src')),
      path.join(root, 'electron-builder.config.cjs'),
    ];
    const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(identity.appId));
    expect(offenders).toEqual([]);
  });
});
