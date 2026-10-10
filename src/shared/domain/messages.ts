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
  'compat.claudeDesktop.guidance.enableExperimental',
  // Claude Desktop, experimental separate profiles
  'compat.claudeDesktop.experimental.summary',
  'compat.claudeDesktop.experimental.checkedSummary',
  'compat.claudeDesktop.experimental.versionChanged',
  'compat.claudeDesktop.experimental.disabled.summary',
  'compat.claudeDesktop.experimental.guarantee.folder',
  'compat.claudeDesktop.experimental.guarantee.untouched',
  'compat.claudeDesktop.experimental.limitation.undocumented',
  'compat.claudeDesktop.experimental.limitation.signInCallback',
  'compat.claudeDesktop.experimental.limitation.notVerifiable',
  'compat.claudeDesktop.experimental.limitation.sharedSystem',
  'compat.claudeDesktop.experimental.guidance.signInOneAtATime',
  'compat.claudeDesktop.experimental.guidance.check',
  // Command-line tools configured through one folder variable (Codex CLI, Gemini CLI)
  'compat.cli.isolated.summary',
  'compat.cli.isolated.guarantee.configDir',
  'compat.cli.isolated.guarantee.concurrent',
  'compat.cli.limitation.projectFiles',
  'compat.cli.limitation.entitlements',
  'compat.cli.limitation.credentialEnvInherited',
  'compat.cli.shared.summary',
  'compat.cli.shared.limitation',
  'compat.cli.versionUnknown.summary',
  'compat.cli.needsVerification.credentialEnv',
  'compat.cli.needsVerification.providerEnv',
  'compat.cli.guidance.install',
  'compat.cli.guidance.verify',
  'compat.cli.guidance.unsetProviderEnv',
  'compat.codexCli.guarantee.credentials',
  'compat.codexCli.guidance.signIn',
  'compat.codexCli.limitation.signInPort',
  'compat.geminiCli.guarantee.credentials',
  'compat.geminiCli.guidance.signIn',
  'compat.geminiCli.limitation.encryptedStorage',
  'compat.geminiCli.limitation.noStatus',
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
  'mechanism.claudeDesktop.experimental',
  'mechanism.codexCli',
  'mechanism.geminiCli',
  // Launch notes
  'launch.note.terminalOpened',
  'launch.note.processStarted',
  'launch.note.sharedLaunch',
  'launch.note.experimentalLaunch',
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
