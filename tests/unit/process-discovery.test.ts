import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  commandLineEndsWithArgument,
  createNodeProcessInspector,
  nodeCommandRunner,
  parseProcessList,
} from '../../src/main/system';

const MARKER = '--user-data-dir=/Users/ana/Library/Application Support/PS/profiles/work';

describe('commandLineEndsWithArgument', () => {
  it('matches the marker only as the complete final argument', () => {
    expect(
      commandLineEndsWithArgument(
        `/Applications/Claude.app/Contents/MacOS/Claude ${MARKER}`,
        MARKER,
      ),
    ).toBe(true);
    expect(commandLineEndsWithArgument(`C:\\x\\claude.exe "${MARKER}"`, MARKER)).toBe(true);
    expect(commandLineEndsWithArgument(`claude ${MARKER} --other`, MARKER)).toBe(false);
    // A folder whose name merely starts with this profile's folder name.
    expect(commandLineEndsWithArgument(`claude ${MARKER} 2`, MARKER)).toBe(false);
    expect(commandLineEndsWithArgument(`claude ${MARKER}-old`, MARKER)).toBe(false);
    expect(commandLineEndsWithArgument(`claude x${MARKER}`, MARKER)).toBe(false);
  });

  it('ignores Chromium helper processes of the same instance', () => {
    expect(
      commandLineEndsWithArgument(`Claude Helper --type=renderer --lang=en ${MARKER}`, MARKER),
    ).toBe(false);
    expect(commandLineEndsWithArgument(`claude.exe "--type=gpu-process" "${MARKER}"`, MARKER)).toBe(
      false,
    );
  });
});

describe('parseProcessList', () => {
  it('reads `<pid> <command line>` rows from ps or PowerShell', () => {
    const output = [
      '  101 /Applications/Claude.app/Contents/MacOS/Claude',
      `  202 /Applications/Claude.app/Contents/MacOS/Claude ${MARKER}`,
      `  203 /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper --type=gpu-process ${MARKER}`,
      `  204 /Applications/Claude.app/Contents/MacOS/Claude ${MARKER} 2`,
      'garbage',
      '',
      `305 C:\\Users\\ana\\AppData\\Local\\AnthropicClaude\\app-0.14.10\\claude.exe "${MARKER}"\r`,
    ].join('\n');
    expect(parseProcessList(output, MARKER)).toEqual([202, 305]);
  });
});

const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

function startWithArgs(args: string[]): ChildProcess {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', ...args], {
    stdio: 'ignore',
  });
  children.push(child);
  return child;
}

describe.runIf(process.platform === 'linux')(
  'findByFinalArgument on Linux (real processes)',
  () => {
    it('finds the main process by its exact final argument and skips helpers', async () => {
      const marker = `--user-data-dir=/tmp/ps-discovery-${process.pid}-${Date.now()}`;
      const main = startWithArgs([marker]);
      const helper = startWithArgs(['--type=renderer', marker]);
      const other = startWithArgs([`${marker} 2`]);
      const inspector = createNodeProcessInspector('linux', nodeCommandRunner);
      let found: number[] | null = [];
      for (let i = 0; i < 50 && found?.length !== 1; i += 1) {
        found = await inspector.findByFinalArgument(marker);
        if (found?.length !== 1) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(found).toEqual([main.pid]);
      expect(found).not.toContain(helper.pid);
      expect(found).not.toContain(other.pid);
    });
  },
);
