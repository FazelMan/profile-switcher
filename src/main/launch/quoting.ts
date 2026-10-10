/**
 * Quoting helpers for the few places where Profile Switcher must produce
 * text that a shell will interpret: the macOS `.command` launcher script and
 * the "copy launch command" feature. Values come from Profile Switcher's own
 * paths and detected executables, never from free-text profile fields, and
 * are additionally validated here.
 */

// eslint-disable-next-line no-control-regex
const NEWLINE_OR_NUL = /[\u0000\n\r]/;

export class UnsafeValueError extends Error {
  constructor(what: string) {
    super(`Refusing to quote unsafe value for ${what}`);
    this.name = 'UnsafeValueError';
  }
}

function assertSafe(value: string, what: string): void {
  if (NEWLINE_OR_NUL.test(value)) throw new UnsafeValueError(what);
}

/** POSIX sh single-quoting: the only special character inside '' is ' itself. */
export function quotePosix(value: string): string {
  assertSafe(value, 'POSIX shell');
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** fish single-quoting: backslash and single quote are escaped with a backslash. */
export function quoteFish(value: string): string {
  assertSafe(value, 'fish shell');
  return `'${value.replace(/[\\']/g, (c) => `\\${c}`)}'`;
}

/** PowerShell single-quoted string: '' is a literal quote; nothing else expands. */
export function quotePowerShell(value: string): string {
  assertSafe(value, 'PowerShell');
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Characters cmd.exe may interpret even inside double quotes (`%` expands
 * variables, `!` expands with delayed expansion, `"` ends the quote). Values
 * containing them are refused instead of escaped; cmd escaping is not
 * reliable enough to trust.
 */
// eslint-disable-next-line no-control-regex
const CMD_UNSAFE = /["%!^\u0000\n\r]/;

export function isCmdSafe(value: string): boolean {
  return !CMD_UNSAFE.test(value);
}

export function quoteCmd(value: string): string {
  if (!isCmdSafe(value)) throw new UnsafeValueError('cmd.exe');
  return `"${value}"`;
}

/**
 * Builds the invocation for a Windows batch shim (e.g. npm's `claude.cmd`).
 * Node refuses to spawn .cmd/.bat files without a shell, so this mirrors
 * Node's own `shell: true` construction (`cmd.exe /d /s /c "..."`) but only
 * for a detected shim path and fixed literal arguments, both validated.
 */
export function windowsShimInvocation(
  shimPath: string,
  args: readonly string[],
  mode: '/c' | '/k',
  comspec: string,
): { file: string; args: string[]; windowsVerbatimArguments: true } {
  const quoted = [quoteCmd(shimPath), ...args.map((arg) => quoteCmd(arg))].join(' ');
  return {
    file: comspec,
    args: ['/d', '/s', mode, `"${quoted}"`],
    windowsVerbatimArguments: true,
  };
}

export function isWindowsShim(file: string): boolean {
  return /\.(cmd|bat)$/i.test(file);
}
