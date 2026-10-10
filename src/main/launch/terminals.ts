import type { TerminalId } from '@shared/domain/settings';
import { findExecutable } from '../adapters/detection';
import type { SystemContext } from '../system';

/**
 * Linux terminal emulators and how each one runs a command given as an
 * argument vector. Arguments are passed as separate argv entries; nothing is
 * joined into a shell string.
 */
export interface LinuxTerminal {
  id: TerminalId;
  displayName: string;
  binary: string;
  buildArgs(command: readonly string[], cwd: string): string[];
}

export const LINUX_TERMINALS: readonly LinuxTerminal[] = [
  {
    // Debian/Ubuntu alternatives entry; policy requires `-e cmd args...`.
    id: 'x-terminal-emulator',
    displayName: 'Default terminal (x-terminal-emulator)',
    binary: 'x-terminal-emulator',
    buildArgs: (command) => ['-e', ...command],
  },
  {
    id: 'gnome-terminal',
    displayName: 'GNOME Terminal',
    binary: 'gnome-terminal',
    buildArgs: (command, cwd) => [`--working-directory=${cwd}`, '--', ...command],
  },
  {
    id: 'konsole',
    displayName: 'Konsole',
    binary: 'konsole',
    buildArgs: (command, cwd) => ['--workdir', cwd, '-e', ...command],
  },
  {
    id: 'xfce4-terminal',
    displayName: 'Xfce Terminal',
    binary: 'xfce4-terminal',
    buildArgs: (command, cwd) => ['--working-directory', cwd, '-x', ...command],
  },
  {
    id: 'kitty',
    displayName: 'kitty',
    binary: 'kitty',
    buildArgs: (command, cwd) => ['--directory', cwd, ...command],
  },
  {
    id: 'alacritty',
    displayName: 'Alacritty',
    binary: 'alacritty',
    buildArgs: (command, cwd) => ['--working-directory', cwd, '-e', ...command],
  },
  {
    id: 'wezterm',
    displayName: 'WezTerm',
    binary: 'wezterm',
    buildArgs: (command, cwd) => ['start', '--cwd', cwd, '--', ...command],
  },
  {
    id: 'foot',
    displayName: 'foot',
    binary: 'foot',
    buildArgs: (command, cwd) => [`--working-directory=${cwd}`, ...command],
  },
  {
    id: 'xterm',
    displayName: 'XTerm',
    binary: 'xterm',
    buildArgs: (command) => ['-e', ...command],
  },
];

export interface MacTerminal {
  id: TerminalId;
  displayName: string;
  /** Candidate .app bundle locations. */
  bundles: readonly string[];
}

export const MAC_TERMINALS: readonly MacTerminal[] = [
  {
    id: 'macos-terminal',
    displayName: 'Terminal',
    bundles: [
      '/System/Applications/Utilities/Terminal.app',
      '/Applications/Utilities/Terminal.app',
    ],
  },
  { id: 'iterm', displayName: 'iTerm', bundles: ['/Applications/iTerm.app'] },
];

export function terminalIdsFor(platform: NodeJS.Platform): TerminalId[] {
  if (platform === 'darwin') return ['auto', ...MAC_TERMINALS.map((t) => t.id)];
  if (platform === 'win32') return ['auto', 'windows-console'];
  return ['auto', ...LINUX_TERMINALS.map((t) => t.id)];
}

export async function resolveLinuxTerminal(
  system: SystemContext,
  preferred: TerminalId,
): Promise<{ terminal: LinuxTerminal; path: string } | null> {
  const known = LINUX_TERMINALS.some((t) => t.id === preferred);
  const candidates =
    preferred === 'auto' || !known
      ? LINUX_TERMINALS
      : LINUX_TERMINALS.filter((t) => t.id === preferred);
  for (const terminal of candidates) {
    const match = await findExecutable(system, terminal.binary, [`/usr/bin/${terminal.binary}`]);
    if (match) return { terminal, path: match.path };
  }
  return null;
}

export async function resolveMacTerminal(
  system: SystemContext,
  preferred: TerminalId,
): Promise<{ terminal: MacTerminal; bundle: string } | null> {
  const candidates =
    preferred === 'auto' || !MAC_TERMINALS.some((t) => t.id === preferred)
      ? MAC_TERMINALS.filter((t) => t.id === 'macos-terminal')
      : MAC_TERMINALS.filter((t) => t.id === preferred);
  for (const terminal of candidates) {
    for (const bundle of terminal.bundles) {
      const stat = await system.files.stat(bundle);
      if (stat?.isDirectory) return { terminal, bundle };
    }
  }
  return null;
}
