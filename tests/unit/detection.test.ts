import { describe, expect, it } from 'vitest';
import {
  findExecutable,
  parseVersion,
  searchPathDirectories,
} from '../../src/main/adapters/detection';
import { fakeFiles, fakeSystem } from '../helpers/fake-system';

describe('searchPathDirectories', () => {
  it('skips relative and empty PATH entries so the working directory is never searched', () => {
    const system = fakeSystem({ env: { PATH: ':.:bin:/usr/local/bin::/usr/bin:/usr/local/bin' } });
    expect(searchPathDirectories(system)).toEqual(['/usr/local/bin', '/usr/bin']);
  });

  it('reads Path case-insensitively and strips quotes on Windows', () => {
    const system = fakeSystem({
      platform: 'win32',
      env: { Path: '"C:\\Program Files\\nodejs";relative;C:\\Tools' },
    });
    expect(searchPathDirectories(system)).toEqual(['C:\\Program Files\\nodejs', 'C:\\Tools']);
  });
});

describe('findExecutable', () => {
  it('prefers PATH order, then known locations', async () => {
    const system = fakeSystem({
      env: { PATH: '/usr/local/bin:/usr/bin' },
      files: fakeFiles({ '/usr/bin/claude': 'exec', '/home/tester/.local/bin/claude': 'exec' }),
    });
    expect(await findExecutable(system, 'claude', ['/home/tester/.local/bin/claude'])).toEqual({
      path: '/usr/bin/claude',
      source: 'path',
    });

    const guiSystem = fakeSystem({
      env: { PATH: '/usr/bin:/bin' },
      files: fakeFiles({ '/home/tester/.local/bin/claude': 'exec' }),
    });
    expect(await findExecutable(guiSystem, 'claude', ['/home/tester/.local/bin/claude'])).toEqual({
      path: '/home/tester/.local/bin/claude',
      source: 'known-location',
    });
  });

  it('ignores non-executable files and directories on POSIX', async () => {
    const system = fakeSystem({
      env: { PATH: '/a:/b' },
      files: fakeFiles({ '/a/claude': 'file', '/b/claude': 'dir' }),
    });
    expect(await findExecutable(system, 'claude', [])).toBeNull();
  });

  it('matches .exe and .cmd (never .ps1) on Windows, in PATH order', async () => {
    const system = fakeSystem({
      platform: 'win32',
      env: { PATH: 'C:\\npm;C:\\bin' },
      files: fakeFiles({
        'C:\\npm\\claude.cmd': 'file',
        'C:\\bin\\claude.exe': 'file',
        'C:\\npm\\claude.ps1': 'file',
      }),
    });
    expect(await findExecutable(system, 'claude', [])).toEqual({
      path: 'C:\\npm\\claude.cmd',
      source: 'path',
    });
  });

  it('ignores relative known locations', async () => {
    const system = fakeSystem({ files: fakeFiles({ 'bin/claude': 'exec' }) });
    expect(await findExecutable(system, 'claude', ['bin/claude'])).toBeNull();
  });
});

describe('parseVersion', () => {
  it('extracts semantic versions from tool output', () => {
    expect(parseVersion('2.1.296 (Claude Code)')).toBe('2.1.296');
    expect(parseVersion('claude v1.0.0-beta.3\n')).toBe('1.0.0-beta.3');
    expect(parseVersion('no version here')).toBeNull();
  });
});
