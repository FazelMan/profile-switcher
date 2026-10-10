/**
 * Message codes exchanged between the main process and the renderer.
 *
 * The main process never sends user-facing prose. It sends a code plus
 * parameters, and the renderer translates it through the active locale
 * catalog. The catalog is typed as `Record<MessageCode, …>`, so adding a code
 * here without translating it fails type-checking.
 */
export const MESSAGE_CODES = [
  // Claude Code compatibility
  'compat.claudeCode.isolated.summary',
  'compat.claudeCode.isolated.guarantee.configDir',
  'compat.claudeCode.isolated.guarantee.credentials',
  'compat.claudeCode.isolated.guarantee.history',
  'compat.claudeCode.isolated.guarantee.concurrent',
  'compat.claudeCode.limitation.consoleKeyless',
  'compat.claudeCode.limitation.projectFiles',
  'compat.claudeCode.limitation.managedSettings',
  'compat.claudeCode.limitation.entitlements',
  'compat.claudeCode.limitation.credentialEnvInherited',
  'compat.claudeCode.limitation.providerEnv',
  'compat.claudeCode.shared.summary',
  'compat.claudeCode.shared.limitation',
  'compat.claudeCode.versionUnknown.summary',
  'compat.claudeCode.needsVerification.credentialEnv',
  'compat.claudeCode.needsVerification.providerEnv',
  'compat.claudeCode.guidance.signIn',
  'compat.claudeCode.guidance.verify',
  'compat.claudeCode.guidance.install',
  'compat.claudeCode.guidance.unsetProviderEnv',
  // Claude Desktop compatibility
  'compat.claudeDesktop.summary',
  'compat.claudeDesktop.limitation.noIsolation',
  'compat.claudeDesktop.limitation.singleInstance',
  'compat.claudeDesktop.limitation.noConcurrent',
  'compat.claudeDesktop.guarantee.opensApp',
  'compat.claudeDesktop.guidance.switchInApp',
  'compat.claudeDesktop.guidance.install',
  'compat.claudeDesktop.unsupportedPlatform.summary',
  // Generic compatibility
  'compat.appNotFound.summary',
  'compat.unknownApp.summary',
  'compat.unsupportedPlatform.summary',
  'compat.configError.directoryMissing',
  'compat.configError.directoryNotDirectory',
  'compat.configError.workingDirectoryMissing',
  'compat.guidance.refreshDetection',
  'compat.guidance.recreateProfile',
  'compat.guidance.editWorkingDirectory',
  // Isolation mechanism descriptions
  'mechanism.claudeCode',
  'mechanism.claudeDesktop',
  // Launch notes
  'launch.note.terminalOpened',
  'launch.note.processStarted',
  'launch.note.sharedLaunch',
  'launch.note.notProofOfSignIn',
  // Notices
  'notice.metadataRecoveredFromBackup',
  'notice.metadataReset',
  'notice.metadataNewerSchema',
] as const;

export type MessageCode = (typeof MESSAGE_CODES)[number];

export type MessageParams = Record<string, string | number>;

export interface Message {
  code: MessageCode;
  params?: MessageParams;
}

export function msg(code: MessageCode, params?: MessageParams): Message {
  return params ? { code, params } : { code };
}
