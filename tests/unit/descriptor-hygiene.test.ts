import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { LINUX_CLOSE_FDS_SCRIPT, withCleanDescriptors } from '../../src/main/system';

describe('withCleanDescriptors', () => {
  it('leaves macOS and Windows invocations unchanged', () => {
    expect(withCleanDescriptors('darwin', '/usr/bin/open', ['-a', 'x'])).toEqual({
      file: '/usr/bin/open',
      args: ['-a', 'x'],
    });
    expect(withCleanDescriptors('win32', 'C:\\a.exe', [])).toEqual({ file: 'C:\\a.exe', args: [] });
  });

  it('routes Linux invocations through the fixed descriptor-closing script with argv intact', () => {
    const call = withCleanDescriptors('linux', '/usr/bin/xterm', ['-e', "it's $(not) expanded"]);
    expect(call.args.slice(-3)).toEqual(['/usr/bin/xterm', '-e', "it's $(not) expanded"]);
    expect(call.args).toContain('profile-switcher-exec');
    expect(LINUX_CLOSE_FDS_SCRIPT).not.toMatch(/xterm|expanded/);
  });
});

describe.runIf(process.platform === 'linux')('descriptor-closing script (real bash)', () => {
  it('closes every inherited descriptor above stderr, including ones numbered 10 and above', () => {
    // A parent shell opens descriptors without close-on-exec, the way Chromium does.
    const call = withCleanDescriptors('linux', '/bin/ls', ['/proc/self/fd']);
    const output = execFileSync(
      '/bin/bash',
      [
        '-c',
        'exec 5>/dev/null 7>/dev/null 12>/dev/null 63>/dev/null; exec "$@"',
        'parent',
        call.file,
        ...call.args,
      ],
      { encoding: 'utf8' },
    );
    const fds = output
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .sort((a, b) => a - b);
    // 0-2 are stdio; ls itself opens exactly one directory descriptor to list /proc/self/fd.
    expect(fds.filter((fd) => fd > 2)).toHaveLength(1);
    expect(fds).not.toContain(5);
    expect(fds).not.toContain(12);
    expect(fds).not.toContain(63);
  });

  it('passes arguments and the environment through unchanged', () => {
    const call = withCleanDescriptors('linux', '/usr/bin/env', []);
    const output = execFileSync(call.file, call.args, {
      encoding: 'utf8',
      env: { KEEP_ME: 'a b $c', PATH: '/usr/bin:/bin' },
    });
    expect(output).toContain('KEEP_ME=a b $c');
  });
});
