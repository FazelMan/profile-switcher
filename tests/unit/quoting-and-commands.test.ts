import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CliLaunchPlan } from '../../src/main/adapters/types';
import { buildCopyCommand, buildPosixLauncherScript } from '../../src/main/launch/commands';
import {
  isCmdSafe,
  quoteCmd,
  quoteFish,
  quotePosix,
  quotePowerShell,
  UnsafeValueError,
  windowsShimInvocation,
} from '../../src/main/launch/quoting';

const posixOnly = process.platform === 'win32' ? describe.skip : describe;

const tricky = [
  "it's",
  'a "quoted" value',
  '$(rm -rf /)',
  '`id`',
  '$HOME and ${PATH}',
  'semi;colon && pipe | amp & redirect > x',
  'back\\slash',
  'glob * ? [a]',
  'Ünïcödé ✓ 仕事',
  ' leading and trailing ',
];

posixOnly('quotePosix (evaluated by a real /bin/sh)', () => {
  it.each(tricky)('round-trips %j literally', (value) => {
    const output = execFileSync('/bin/sh', ['-c', `printf '%s' ${quotePosix(value)}`], {
      encoding: 'utf8',
    });
    expect(output).toBe(value);
  });
});

describe('quoting rejects values that cannot be safely represented', () => {
  it('refuses newlines and NUL for every shell', () => {
    for (const quote of [quotePosix, quoteFish, quotePowerShell, quoteCmd]) {
      expect(() => quote('a\nb')).toThrow(UnsafeValueError);
      expect(() => quote('a\u0000b')).toThrow(UnsafeValueError);
    }
  });

  it('escapes PowerShell and fish single quotes', () => {
    expect(quotePowerShell("it's")).toBe("'it''s'");
    expect(quoteFish("it's \\ here")).toBe("'it\\'s \\\\ here'");
  });

  it('refuses cmd.exe metacharacters that expand inside quotes', () => {
    expect(isCmdSafe('C:\\Program Files (x86)\\Claude\\claude.cmd')).toBe(true);
    for (const bad of ['C:\\%PATH%\\x', 'C:\\a"b', 'C:\\a!b!', 'C:\\a^b']) {
      expect(isCmdSafe(bad)).toBe(false);
      expect(() => quoteCmd(bad)).toThrow(UnsafeValueError);
    }
  });

  it('builds a verbatim cmd.exe invocation for npm-style shims', () => {
    const call = windowsShimInvocation(
      'C:\\Users\\Ana Lucía\\AppData\\Roaming\\npm\\claude.cmd',
      ['--version'],
      '/c',
      'C:\\Windows\\System32\\cmd.exe',
    );
    expect(call).toEqual({
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        '""C:\\Users\\Ana Lucía\\AppData\\Roaming\\npm\\claude.cmd" "--version""',
      ],
      windowsVerbatimArguments: true,
    });
    expect(() => windowsShimInvocation('C:\\evil%x%\\claude.cmd', [], '/c', 'cmd.exe')).toThrow(
      UnsafeValueError,
    );
  });
});

function plan(overrides: Partial<CliLaunchPlan> = {}): CliLaunchPlan {
  return {
    type: 'cli',
    executable: '/opt/claude tools/bin/claude',
    args: [],
    env: {
      set: { CLAUDE_CONFIG_DIR: "/home/ana/Profile's/work" },
      unset: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
      prependPath: ['/opt/claude tools/bin'],
    },
    cwd: '/home/ana/projects/my app',
    isolation: 'isolated',
    ...overrides,
  };
}

describe('buildCopyCommand', () => {
  it('produces a single env invocation for POSIX shells', () => {
    expect(buildCopyCommand(plan(), 'posix', false)).toBe(
      "env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN CLAUDE_CONFIG_DIR='/home/ana/Profile'\\''s/work' '/opt/claude tools/bin/claude'",
    );
    expect(buildCopyCommand(plan(), 'posix', true)).toMatch(
      /^cd '\/home\/ana\/projects\/my app' && env /,
    );
  });

  it('produces PowerShell statements', () => {
    const command = buildCopyCommand(
      plan({
        executable: 'C:\\Users\\Ana\\.local\\bin\\claude.exe',
        env: {
          set: { CLAUDE_CONFIG_DIR: "C:\\P's" },
          unset: ['ANTHROPIC_API_KEY'],
          prependPath: [],
        },
      }),
      'powershell',
      false,
    );
    expect(command).toBe(
      "Remove-Item -ErrorAction SilentlyContinue Env:ANTHROPIC_API_KEY; $env:CLAUDE_CONFIG_DIR = 'C:\\P''s'; & 'C:\\Users\\Ana\\.local\\bin\\claude.exe'",
    );
  });

  it('produces cmd.exe statements and refuses unsafe paths', () => {
    const windowsPlan = plan({
      executable: 'C:\\Users\\Ana\\.local\\bin\\claude.exe',
      cwd: 'C:\\work',
      env: {
        set: { CLAUDE_CONFIG_DIR: 'C:\\Profiles\\work' },
        unset: ['ANTHROPIC_API_KEY'],
        prependPath: [],
      },
    });
    expect(buildCopyCommand(windowsPlan, 'cmd', true)).toBe(
      'cd /d "C:\\work" & set "ANTHROPIC_API_KEY=" & set "CLAUDE_CONFIG_DIR=C:\\Profiles\\work" & "C:\\Users\\Ana\\.local\\bin\\claude.exe"',
    );
    expect(() =>
      buildCopyCommand(
        { ...windowsPlan, env: { ...windowsPlan.env, set: { CLAUDE_CONFIG_DIR: 'C:\\%TEMP%' } } },
        'cmd',
        false,
      ),
    ).toThrow(UnsafeValueError);
  });

  it('refuses invalid environment variable names', () => {
    expect(() =>
      buildCopyCommand(
        plan({ env: { set: { 'BAD;NAME': 'x' }, unset: [], prependPath: [] } }),
        'posix',
        false,
      ),
    ).toThrow();
  });
});

posixOnly('buildPosixLauncherScript (executed by a real /bin/sh)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ps-script-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('applies exactly the planned environment and working directory', () => {
    const binDir = path.join(dir, "bin dir with 'quote'");
    const workDir = path.join(dir, 'work $(dir)');
    const configDir = path.join(dir, 'config "dir"');
    const output = path.join(dir, 'out.txt');
    execFileSync('/bin/mkdir', ['-p', binDir, workDir, configDir]);
    const fake = path.join(binDir, 'claude');
    writeFileSync(
      fake,
      `#!/bin/sh\n{ echo "cfg=$CLAUDE_CONFIG_DIR"; echo "key=\${ANTHROPIC_API_KEY-unset}"; echo "keep=$KEEP_ME"; echo "cwd=$(pwd)"; echo "path0=$(echo "$PATH" | cut -d: -f1)"; } > "$OUT_FILE"\n`,
    );
    chmodSync(fake, 0o755);

    const script = buildPosixLauncherScript(
      plan({
        executable: fake,
        cwd: workDir,
        env: {
          set: { CLAUDE_CONFIG_DIR: configDir },
          unset: ['ANTHROPIC_API_KEY'],
          prependPath: [binDir],
        },
      }),
      'work-abc123',
    );
    const scriptPath = path.join(dir, 'launch.command');
    writeFileSync(scriptPath, script, { mode: 0o700 });
    execFileSync('/bin/sh', [scriptPath], {
      env: {
        PATH: '/usr/bin:/bin',
        ANTHROPIC_API_KEY: 'sk-ant-should-be-removed',
        KEEP_ME: 'yes',
        OUT_FILE: output,
      },
    });

    const lines = readFileSync(output, 'utf8').trim().split('\n');
    expect(lines).toEqual([
      `cfg=${configDir}`,
      'key=unset',
      'keep=yes',
      `cwd=${workDir}`,
      `path0=${binDir}`,
    ]);
    expect(script).not.toContain('sk-ant');
  });
});
