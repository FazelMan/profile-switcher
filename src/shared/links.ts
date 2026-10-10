import { APP_IDENTITY } from './app-identity';

/**
 * External links the renderer may ask the main process to open. The renderer
 * sends only an ID; it can never supply a URL. The main process additionally
 * checks the scheme and host before calling `shell.openExternal`.
 */
export const EXTERNAL_LINKS = {
  repository: APP_IDENTITY.repositoryUrl,
  issues: `${APP_IDENTITY.repositoryUrl}/issues`,
  license: `${APP_IDENTITY.repositoryUrl}/blob/main/LICENSE`,
  security: `${APP_IDENTITY.repositoryUrl}/blob/main/SECURITY.md`,
  compatibility: `${APP_IDENTITY.repositoryUrl}/blob/main/docs/compatibility.md`,
  claudeCodeMultipleAccounts:
    'https://code.claude.com/docs/en/authentication#log-in-with-multiple-accounts',
  claudeCodeCredentials: 'https://code.claude.com/docs/en/authentication#credential-management',
  claudeCodeInstall: 'https://code.claude.com/docs/en/setup',
  claudeDesktopDownload: 'https://claude.ai/download',
} as const;

export type LinkId = keyof typeof EXTERNAL_LINKS;

export const LINK_IDS = Object.keys(EXTERNAL_LINKS) as LinkId[];

export const ALLOWED_LINK_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'code.claude.com',
  'claude.ai',
]);
