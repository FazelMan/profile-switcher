import { describe, expect, it, vi } from 'vitest';
import { createNodeQuitRequester, ProcessCloser } from '../../src/main/runtime/process-closer';
import { fakeProcesses, fakeRunner, nullLogger } from '../helpers/fake-system';

describe('ProcessCloser', () => {
  it('asks the process to quit and waits until it has exited', async () => {
    const processes = fakeProcesses({ 500: { commandLine: 'claude' } });
    const requestQuit = vi.fn(async (pid: number) => {
      setTimeout(() => Reflect.deleteProperty(processes.table, pid), 30);
      return true;
    });
    const closer = new ProcessCloser({ requestQuit, processes, logger: nullLogger, pollMs: 5 });
    await expect(closer.close(500)).resolves.toEqual({ pid: 500, exited: true });
    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  it('leaves a process that does not exit in time running and reports it', async () => {
    const processes = fakeProcesses({ 501: { commandLine: 'Claude' } });
    const requestQuit = vi.fn(async () => true);
    const closer = new ProcessCloser({
      requestQuit,
      processes,
      logger: nullLogger,
      timeoutMs: 40,
      pollMs: 5,
    });
    await expect(closer.close(501)).resolves.toEqual({ pid: 501, exited: false });
    expect(requestQuit).toHaveBeenCalledTimes(1);
    expect(processes.isAlive(501)).toBe(true);
  });

  it('reports a quit request that could not be delivered', async () => {
    const processes = fakeProcesses({ 502: { commandLine: 'claude.exe' } });
    const closer = new ProcessCloser({
      requestQuit: async () => false,
      processes,
      logger: nullLogger,
    });
    await expect(closer.close(502)).resolves.toEqual({ pid: 502, exited: false });
  });

  it('does nothing for a process that already exited', async () => {
    const requestQuit = vi.fn(async () => true);
    const closer = new ProcessCloser({
      requestQuit,
      processes: fakeProcesses({}),
      logger: nullLogger,
    });
    await expect(closer.close(503)).resolves.toEqual({ pid: 503, exited: true });
    expect(requestQuit).not.toHaveBeenCalled();
  });
});

describe('createNodeQuitRequester', () => {
  it('asks Windows to close a process without forcing it', async () => {
    const runner = fakeRunner(() => ({ exitCode: 0 }));
    const requestQuit = createNodeQuitRequester('win32', runner);
    await expect(requestQuit(4321)).resolves.toBe(true);
    expect(runner.calls[0]?.file).toMatch(/taskkill\.exe$/);
    expect(runner.calls[0]?.args).toEqual(['/PID', '4321']);
  });

  it('reports failure when Windows refuses a normal close (console programs)', async () => {
    const runner = fakeRunner(() => ({ exitCode: 1 }));
    await expect(createNodeQuitRequester('win32', runner)(4321)).resolves.toBe(false);
  });

  it('refuses invalid targets, including PID 1 and Profile Switcher itself', async () => {
    const runner = fakeRunner();
    for (const platform of ['linux', 'darwin', 'win32'] as const) {
      const requestQuit = createNodeQuitRequester(platform, runner);
      for (const pid of [0, 1, -5, 1.5, process.pid])
        await expect(requestQuit(pid)).resolves.toBe(false);
    }
    expect(runner.calls).toEqual([]);
  });
});
