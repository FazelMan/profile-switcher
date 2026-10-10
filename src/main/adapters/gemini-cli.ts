import { msg } from '@shared/domain/messages';
import { pathApiFor } from '../platform';
import type { SystemContext } from '../system';
import { systemEnv } from './detection';
import { EnvHomeCliAdapter } from './env-home-cli';

export const GEMINI_CLI_ID = 'gemini-cli';

/**
 * Google Gemini CLI.
 *
 * Mechanism: `GEMINI_CLI_HOME`, documented by Google as "the root directory
 * for Gemini CLI's user-level configuration and storage"; the CLI creates a
 * `.gemini` folder inside it. A Google sign-in is cached in
 * `<folder>/.gemini/oauth_creds.json`. Verified with Gemini CLI 0.63.0 (source
 * and a run on Linux): user-level files go under the profile folder and
 * nothing under `$HOME`.
 *
 * Exception, from the source: with `GEMINI_FORCE_ENCRYPTED_FILE_STORAGE=true`
 * the sign-in is stored under one fixed OS keychain entry
 * (`gemini-cli-oauth` / `main-account`) shared by every folder, so profiles
 * are marked Needs verification while it is set. Vertex AI and service-account
 * credentials also bypass the per-profile sign-in.
 *
 * Gemini CLI has no command that reports the sign-in, so Verify is not offered.
 */
function knownLocations(system: SystemContext): string[] {
  const p = pathApiFor(system.platform);
  const home = system.homeDir;
  if (system.platform === 'win32') {
    const appData = systemEnv(system, 'APPDATA') ?? p.join(home, 'AppData', 'Roaming');
    return [p.join(appData, 'npm', 'gemini.cmd')];
  }
  return [
    '/opt/homebrew/bin/gemini',
    '/usr/local/bin/gemini',
    p.join(home, '.npm-global', 'bin', 'gemini'),
    p.join(home, '.volta', 'bin', 'gemini'),
    p.join(home, '.local', 'bin', 'gemini'),
    '/usr/bin/gemini',
  ];
}

export function createGeminiCliAdapter(): EnvHomeCliAdapter {
  return new EnvHomeCliAdapter({
    id: GEMINI_CLI_ID,
    displayName: 'Gemini CLI',
    executableName: 'gemini',
    homeVariable: 'GEMINI_CLI_HOME',
    reservedDirectories: (system) => [pathApiFor(system.platform).join(system.homeDir, '.gemini')],
    knownLocations,
    credentialVariables: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_ACCESS_TOKEN'],
    providerVariables: [
      { name: 'GOOGLE_GENAI_USE_VERTEXAI', active: 'true' },
      { name: 'GOOGLE_APPLICATION_CREDENTIALS', active: 'non-empty' },
      { name: 'GEMINI_FORCE_ENCRYPTED_FILE_STORAGE', active: 'true' },
    ],
    mechanism: msg('mechanism.geminiCli'),
    projectFiles: 'GEMINI.md, .gemini/',
    messages: {
      credentials: msg('compat.geminiCli.guarantee.credentials'),
      signIn: msg('compat.geminiCli.guidance.signIn'),
      extraLimitations: [
        msg('compat.geminiCli.limitation.encryptedStorage'),
        msg('compat.geminiCli.limitation.noStatus'),
      ],
    },
  });
}
