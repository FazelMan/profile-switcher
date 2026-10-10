import { msg } from '@shared/domain/messages';
import { pathApiFor } from '../platform';
import type { RunResult, SystemContext } from '../system';
import { systemEnv } from './detection';
import { EnvHomeCliAdapter, type StatusReading } from './env-home-cli';

export const CODEX_CLI_ID = 'codex-cli';

/**
 * OpenAI Codex CLI.
 *
 * Mechanism: `CODEX_HOME`. OpenAI documents that Codex keeps its
 * configuration and cached sign-in under `CODEX_HOME` (default `~/.codex`):
 * `auth.json` there, or the OS keyring. Codex's source keys the keyring entry
 * to a SHA-256 of the canonical `CODEX_HOME` path, so each folder has its own
 * entry. Verified with Codex CLI 0.162.1 on Linux: a sign-in made with one
 * `CODEX_HOME` is not seen with another, and nothing is written to `$HOME`.
 *
 * `OPENAI_API_KEY` and `CODEX_API_KEY` supply a key directly and are removed
 * from launches by default. `codex login status` reports the sign-in method
 * (on stderr) and exits 1 when signed out; it does not report the folder.
 */
export function parseCodexLoginStatus(result: RunResult): StatusReading | null {
  const text = `${result.stdout}\n${result.stderr}`;
  if (/CODEX_HOME points to/i.test(text)) return null;
  const loggedIn = /Logged in using ([^\n]+)/i.exec(text);
  if (result.exitCode === 0 && loggedIn?.[1]) {
    const method = loggedIn[1];
    return {
      loggedIn: true,
      authMethod: /api key/i.test(method)
        ? 'API key'
        : /chatgpt/i.test(method)
          ? 'ChatGPT'
          : method.replace(/\s+-\s+.*$/, '').slice(0, 40),
    };
  }
  if (/Not logged in/i.test(text)) return { loggedIn: false, authMethod: null };
  return null;
}

function knownLocations(system: SystemContext): string[] {
  const p = pathApiFor(system.platform);
  const home = system.homeDir;
  if (system.platform === 'win32') {
    const appData = systemEnv(system, 'APPDATA') ?? p.join(home, 'AppData', 'Roaming');
    return [p.join(appData, 'npm', 'codex.cmd')];
  }
  return [
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    p.join(home, '.npm-global', 'bin', 'codex'),
    p.join(home, '.volta', 'bin', 'codex'),
    p.join(home, '.local', 'bin', 'codex'),
    '/usr/bin/codex',
  ];
}

export function createCodexCliAdapter(): EnvHomeCliAdapter {
  return new EnvHomeCliAdapter({
    id: CODEX_CLI_ID,
    displayName: 'Codex CLI',
    executableName: 'codex',
    homeVariable: 'CODEX_HOME',
    reservedDirectories: (system) => [pathApiFor(system.platform).join(system.homeDir, '.codex')],
    knownLocations,
    credentialVariables: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    providerVariables: [],
    mechanism: msg('mechanism.codexCli'),
    projectFiles: 'AGENTS.md, .codex/',
    messages: {
      credentials: msg('compat.codexCli.guarantee.credentials'),
      signIn: msg('compat.codexCli.guidance.signIn'),
      extraLimitations: [msg('compat.codexCli.limitation.signInPort')],
    },
    status: { args: ['login', 'status'], parse: parseCodexLoginStatus },
  });
}
