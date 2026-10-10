import type { ErrorCode } from '@shared/domain/errors';
import type { MessageCode } from '@shared/domain/messages';

/**
 * English catalog. Every locale must provide the same shape: `messages` and
 * `errors` are typed against the shared code lists, so a missing translation
 * is a type error. Strings may contain `{param}` placeholders.
 */
export interface ErrorText {
  title: string;
  reason: string;
  next: string;
}

const messages: Record<MessageCode, string> = {
  'compat.claudeCode.isolated.summary':
    'Separate configuration folder via CLAUDE_CONFIG_DIR, documented by Anthropic. Detected Claude Code {version}.',
  'compat.claudeCode.isolated.guarantee.configDir':
    "Claude Code reads and writes its settings, MCP servers, and per-project state in this profile's own folder.",
  'compat.claudeCode.isolated.guarantee.credentials':
    'A claude.ai sign-in (or Console API key) made in this profile is stored for this folder only — in .credentials.json, or on macOS in a Keychain entry tied to this folder.',
  'compat.claudeCode.isolated.guarantee.history':
    "Session history, transcripts, and plugins are kept in this profile's folder.",
  'compat.claudeCode.isolated.guarantee.concurrent':
    'Profiles can run at the same time, and each Claude Code process uses only its own folder. Launching one never modifies another; it is closed only in Switch mode, after you confirm.',
  'compat.claudeCode.limitation.consoleKeyless':
    'Console sign-ins made without an API key ("Anthropic profiles") are stored outside the configuration folder and are shared between profiles.',
  'compat.claudeCode.limitation.projectFiles':
    'Project files such as .claude/settings.json and CLAUDE.md live in your repositories and apply to every profile that opens them.',
  'compat.claudeCode.limitation.managedSettings':
    'Organization-managed settings and policies on this computer apply to every profile.',
  'compat.claudeCode.limitation.entitlements':
    'Subscription, plan limits, and organization membership come from the account you sign in with — not from the profile.',
  'compat.claudeCode.limitation.credentialEnvInherited':
    "This profile passes credential variables through to Claude Code. They take precedence over the profile's own sign-in.",
  'compat.claudeCode.limitation.providerEnv':
    "A cloud-provider or federation variable is active, so Claude Code authenticates through that provider instead of the profile's sign-in.",
  'compat.claudeCode.shared.summary': "Uses Claude Code's default configuration. Not isolated.",
  'compat.claudeCode.shared.limitation':
    'Settings, history, and sign-in are shared with every other use of Claude Code that does not set CLAUDE_CONFIG_DIR.',
  'compat.claudeCode.versionUnknown.summary':
    'Claude Code was found, but its version could not be read. Verify this profile before relying on isolation.',
  'compat.claudeCode.needsVerification.credentialEnv':
    "Credential variables ({variables}) are passed through and override this profile's sign-in.",
  'compat.claudeCode.needsVerification.providerEnv':
    'Provider variables ({variables}) are active, so per-profile sign-in may not apply.',
  'compat.claudeCode.guidance.signIn':
    'Launch the profile and sign in with /login. Each profile signs in separately.',
  'compat.claudeCode.guidance.verify':
    'Use Verify to ask Claude Code which configuration folder and account it is actually using.',
  'compat.claudeCode.guidance.install': 'Install Claude Code, then refresh detection.',
  'compat.claudeCode.guidance.unsetProviderEnv':
    'Remove the provider variables from your environment if you want per-profile sign-in.',
  'compat.claudeDesktop.summary':
    'Opens Claude Desktop with its normal data and sign-in. Not isolated.',
  'compat.claudeDesktop.limitation.noIsolation':
    "Anthropic does not document a way to run Claude Desktop with separate data folders. This profile uses Claude Desktop's normal data, shared with every ordinary launch.",
  'compat.claudeDesktop.limitation.singleInstance':
    'If Claude Desktop is already running, opening it brings the existing window forward. It does not switch accounts.',
  'compat.claudeDesktop.limitation.noConcurrent':
    'With its normal data, Claude Desktop runs one account at a time.',
  'compat.claudeDesktop.guarantee.opensApp': 'Opens the installed Claude Desktop application.',
  'compat.claudeDesktop.guidance.switchInApp':
    'To use a different account, sign out and sign back in inside Claude Desktop.',
  'compat.claudeDesktop.guidance.install':
    'Install Claude Desktop from claude.ai/download, then refresh detection.',
  'compat.claudeDesktop.unsupportedPlatform.summary':
    'Claude Desktop is not available for this operating system.',
  'compat.claudeDesktop.guidance.enableExperimental':
    'To keep several accounts side by side, turn on experimental Claude Desktop profiles in Settings, then create a Claude Desktop profile with its own folder.',
  'compat.claudeDesktop.experimental.summary':
    "Experimental. Claude Desktop starts with this profile's own data folder through the undocumented --user-data-dir option. Neither Anthropic nor Profile Switcher guarantees that accounts stay separate; check it yourself before relying on it.",
  'compat.claudeDesktop.experimental.checkedSummary':
    'Experimental · checked by you. You recorded that this profile keeps its own sign-in with the installed Claude Desktop version. That is your own observation, not a guarantee.',
  'compat.claudeDesktop.experimental.versionChanged':
    'Claude Desktop has changed since you checked this profile. The undocumented option may behave differently now; check it again.',
  'compat.claudeDesktop.experimental.disabled.summary':
    'This profile has its own Claude Desktop folder, but experimental Claude Desktop profiles are turned off. It is not opened with your shared account instead.',
  'compat.claudeDesktop.experimental.guarantee.folder':
    "Claude Desktop is started with this profile's folder as its data folder (--user-data-dir), and Profile Switcher confirms that the running app received it.",
  'compat.claudeDesktop.experimental.guarantee.untouched':
    "Profile Switcher never reads, changes, or copies anything inside this folder or Claude Desktop's normal data, and never handles your sign-in.",
  'compat.claudeDesktop.experimental.limitation.undocumented':
    'Anthropic does not document or support this option. A Claude Desktop update, or the app restarting itself to install one, may ignore it; the app would then open with your normal account and data.',
  'compat.claudeDesktop.experimental.limitation.signInCallback':
    "Signing in through the browser returns to Claude Desktop through a claude:// link that your OS delivers to only one running instance. A sign-in may finish in a different profile's window.",
  'compat.claudeDesktop.experimental.limitation.notVerifiable':
    'Profile Switcher cannot see which account a Claude Desktop window is signed in to; only you can check that.',
  'compat.claudeDesktop.experimental.limitation.sharedSystem':
    'Anything Claude Desktop keeps outside its data folder (for example OS keychain items or files in your home folder) may still be shared between profiles.',
  'compat.claudeDesktop.experimental.guidance.signInOneAtATime':
    'Sign in to one profile at a time: close the other Claude Desktop profiles while you sign in.',
  'compat.claudeDesktop.experimental.guidance.check':
    'After signing in to each profile, quit and reopen them, confirm each shows its own account, then record your check in Details.',
  'compat.cli.isolated.summary':
    'Separate configuration folder via {variable}, documented by the vendor. Detected {app} {version}.',
  'compat.cli.isolated.guarantee.configDir':
    "{app} reads and writes its settings, history, and stored sign-in in this profile's own folder ({variable}).",
  'compat.cli.isolated.guarantee.concurrent':
    'Profiles can run at the same time, each {app} process using only its own folder. Launching one never modifies another; it is closed only in Switch mode, after you confirm.',
  'compat.cli.limitation.projectFiles':
    'Project files in your repositories ({files}) apply to every profile that opens them.',
  'compat.cli.limitation.entitlements':
    'Subscription, plan limits, and organization membership come from the account you sign in with — not from the profile.',
  'compat.cli.limitation.credentialEnvInherited':
    "This profile passes credential variables through to {app}. They take precedence over the profile's own sign-in.",
  'compat.cli.shared.summary': "Uses {app}'s default configuration. Not isolated.",
  'compat.cli.shared.limitation':
    'Settings, history, and sign-in are shared with every other use of {app} that does not set {variable}.',
  'compat.cli.versionUnknown.summary':
    '{app} was found, but its version could not be read. Check this profile before relying on isolation.',
  'compat.cli.needsVerification.credentialEnv':
    "Credential variables ({variables}) are passed through and override this profile's sign-in.",
  'compat.cli.needsVerification.providerEnv':
    "Provider or credential-storage variables ({variables}) are active, so this profile's own sign-in may not apply.",
  'compat.cli.guidance.install': 'Install {app}, then refresh detection.',
  'compat.cli.guidance.verify': 'Use Verify to ask {app} whether this profile is signed in.',
  'compat.cli.guidance.unsetProviderEnv':
    'Remove those variables from your environment if you want per-profile sign-in.',
  'compat.codexCli.guarantee.credentials':
    "A ChatGPT or API-key sign-in made in this profile is stored for this folder only: in auth.json inside it, or in the OS keyring under an entry derived from this folder's path.",
  'compat.codexCli.guidance.signIn':
    'Launch the profile and sign in when Codex asks (or run codex login in it). Each profile signs in separately.',
  'compat.codexCli.limitation.signInPort':
    'The browser sign-in returns to whichever Codex is waiting for it, so sign in to one profile at a time.',
  'compat.geminiCli.guarantee.credentials':
    "A Google sign-in made in this profile is stored in this folder (.gemini/oauth_creds.json), together with the profile's settings and history.",
  'compat.geminiCli.guidance.signIn':
    'Launch the profile and choose a sign-in method when Gemini CLI asks (or use /auth). Each profile signs in separately.',
  'compat.geminiCli.limitation.encryptedStorage':
    'If GEMINI_FORCE_ENCRYPTED_FILE_STORAGE=true is set, Gemini CLI keeps the sign-in in one OS keychain entry shared by all profiles; profiles are then marked Needs verification.',
  'compat.geminiCli.limitation.noStatus':
    'Gemini CLI has no command that reports its sign-in, so Profile Switcher cannot verify which account a profile uses. Check it inside Gemini CLI.',
  'compat.appNotFound.summary': '{app} was not found on this computer.',
  'compat.unknownApp.summary':
    'This profile targets an application ("{app}") that this version of Profile Switcher does not support.',
  'compat.unsupportedPlatform.summary': '{app} is not supported on this operating system.',
  'compat.configError.directoryMissing': "The profile's folder no longer exists.",
  'compat.configError.directoryNotDirectory':
    "The profile's folder path points to a file, not a folder.",
  'compat.configError.workingDirectoryMissing': "The profile's working directory no longer exists.",
  'compat.guidance.refreshDetection': 'After installing, choose Refresh detection.',
  'compat.guidance.recreateProfile':
    'Restore the folder (for example, reconnect the drive) or create a new profile.',
  'compat.guidance.editWorkingDirectory':
    'Edit the profile and choose an existing working directory.',
  'mechanism.claudeCode': 'CLAUDE_CONFIG_DIR (documented by Anthropic)',
  'mechanism.claudeDesktop': 'No documented mechanism',
  'mechanism.claudeDesktop.experimental': '--user-data-dir (undocumented · experimental)',
  'mechanism.codexCli': 'CODEX_HOME (documented by OpenAI)',
  'mechanism.geminiCli': 'GEMINI_CLI_HOME (documented by Google)',
  'launch.note.terminalOpened': 'A terminal window was opened for this profile.',
  'launch.note.processStarted': 'The application process was started.',
  'launch.note.sharedLaunch': "This launch uses the application's shared sign-in.",
  'launch.note.experimentalLaunch':
    "Claude Desktop was started with this profile's own data folder (experimental). Check inside the app which account it shows.",
  'launch.note.notProofOfSignIn':
    'Starting a process does not confirm which account is signed in. Use Verify to check.',
  'notice.metadataRecoveredFromBackup':
    'Your profile list was damaged and has been restored from the most recent backup.',
  'notice.metadataReset':
    'Your profile list was unreadable and no usable backup existed. The damaged file was kept beside the new one and Profile Switcher started with an empty list. Profile folders on disk were not touched.',
  'notice.metadataNewerSchema':
    'Your profile list was saved by a newer version of Profile Switcher (format {version}). Changes are disabled until you update.',
};

const errors: Record<ErrorCode, ErrorText> = {
  VALIDATION_FAILED: {
    title: 'Some details are not valid',
    reason: 'The value for "{field}" was rejected.',
    next: 'Correct it and try again.',
  },
  PROFILE_NOT_FOUND: {
    title: 'Profile not found',
    reason: 'It may already have been deleted.',
    next: 'The list has been refreshed.',
  },
  DUPLICATE_PROFILE_NAME: {
    title: 'That name is already used',
    reason: 'Another profile for this application is called "{name}".',
    next: 'Choose a different name.',
  },
  UNKNOWN_APPLICATION: {
    title: 'Unknown application',
    reason: 'This version of Profile Switcher does not support "{app}".',
    next: 'Update Profile Switcher or choose another application.',
  },
  STORAGE_KIND_NOT_SUPPORTED: {
    title: 'Folder option not available',
    reason: '{app} does not support this kind of profile folder.',
    next: 'Choose one of the listed options.',
  },
  APP_DEFAULT_ALREADY_USED: {
    title: 'Default configuration already in use',
    reason: "Another profile already uses {app}'s shared default configuration.",
    next: 'Give this profile its own folder instead.',
  },
  DIRECTORY_NOT_ABSOLUTE: {
    title: 'Folder path is not valid',
    reason: 'Profile folders must be absolute paths on a local drive.',
    next: 'Use Choose… to pick a folder.',
  },
  DIRECTORY_IS_FILE: {
    title: 'That path is a file',
    reason: 'A profile folder must be a folder.',
    next: 'Choose a folder instead.',
  },
  DIRECTORY_NOT_EMPTY: {
    title: 'The folder already contains files',
    reason:
      'Profile Switcher never modifies or deletes existing files, but the application will read and write its configuration there.',
    next: 'Confirm that you want to use it anyway, or choose an empty folder.',
  },
  DIRECTORY_RESERVED: {
    title: 'That folder cannot be used',
    reason:
      "It is a system location, your home folder, Profile Switcher's own data, or an application's default configuration folder.",
    next: 'Choose or create a dedicated folder for this profile.',
  },
  DIRECTORY_OVERLAPS_PROFILE: {
    title: 'Folder overlaps another profile',
    reason:
      "It is the same as, inside, or contains another profile's folder. Profiles would share data.",
    next: 'Choose a separate folder.',
  },
  DIRECTORY_CREATE_FAILED: {
    title: 'Could not create the folder',
    reason: 'The location may be read-only or you may not have permission.',
    next: 'Choose another location.',
  },
  DIRECTORY_NOT_WRITABLE: {
    title: 'Folder is not writable',
    reason: 'You do not have permission to write to this folder.',
    next: 'Choose a folder you own.',
  },
  DIRECTORY_MISSING: {
    title: "The profile's folder is missing",
    reason: 'It may have been moved, deleted, or be on a disconnected drive.',
    next: 'Restore the folder or create a new profile.',
  },
  WORKING_DIRECTORY_INVALID: {
    title: 'Working directory is not valid',
    reason: 'It must be an existing folder given as an absolute path.',
    next: 'Choose an existing folder.',
  },
  METADATA_READ_FAILED: {
    title: 'Could not read profile data',
    reason: "The file could not be opened. Check the folder's permissions.",
    next: 'See Diagnostics for the file location.',
  },
  METADATA_WRITE_FAILED: {
    title: 'Could not save changes',
    reason: 'The profile list could not be written. The disk may be full or read-only.',
    next: 'Free some space or check permissions, then try again. Nothing was changed.',
  },
  METADATA_READ_ONLY: {
    title: 'Changes are disabled',
    reason: 'Your profile list was saved by a newer version of Profile Switcher.',
    next: 'Update Profile Switcher to make changes.',
  },
  APP_NOT_FOUND: {
    title: '{app} was not found',
    reason:
      'It may not be installed, or it is installed somewhere Profile Switcher does not search.',
    next: 'Install it, then refresh detection.',
  },
  APP_UNSUPPORTED_PLATFORM: {
    title: '{app} is not available on this OS',
    reason: 'The vendor does not provide it for this operating system.',
    next: 'Choose another application.',
  },
  EXECUTABLE_INVALID: {
    title: 'Unsafe launch path',
    reason: 'A path contains characters that cannot be passed safely to the terminal or shell.',
    next: 'Move the application or folder to a path without unusual characters (such as quotes, %, or line breaks).',
  },
  LAUNCH_NOT_AVAILABLE: {
    title: 'This profile cannot be launched right now',
    reason: 'Its status is "{state}".',
    next: 'Open Details to see what needs attention.',
  },
  LAUNCH_FAILED: {
    title: 'Launch failed',
    reason: 'The operating system could not start the terminal or application.',
    next: 'Check Diagnostics, then try again. Your profile is unchanged.',
  },
  TERMINAL_NOT_FOUND: {
    title: 'No terminal found',
    reason: 'Profile Switcher could not find the selected terminal application.',
    next: 'Install a terminal, pick another one in Settings, or use Copy command.',
  },
  SWITCH_CLOSE_FAILED: {
    title: 'The other profile did not close',
    reason:
      '{names} did not quit after being asked. Nothing was forced, and the new profile was not opened.',
    next: 'Close it yourself (it may be asking to save work), or choose Open alongside.',
  },
  VERIFICATION_NOT_SUPPORTED: {
    title: 'Verification not available',
    reason: 'This application does not report which configuration it is using.',
    next: 'See the compatibility notes for this application.',
  },
  VERIFICATION_FAILED: {
    title: 'Verification failed',
    reason:
      'The application did not return a readable status ({reason}). Older versions may not support it.',
    next: 'Update the application and try again.',
  },
  OPEN_FOLDER_FAILED: {
    title: 'Could not open the folder',
    reason: 'The file manager could not be opened for this location.',
    next: 'See Details for the full path.',
  },
  LINK_NOT_ALLOWED: {
    title: 'Link blocked',
    reason: 'Only a fixed list of project and documentation links can be opened.',
    next: 'No action needed.',
  },
  FORBIDDEN_SENDER: {
    title: 'Request blocked',
    reason: 'The request did not come from Profile Switcher’s own window.',
    next: 'Restart Profile Switcher.',
  },
  INTERNAL_ERROR: {
    title: 'Something went wrong',
    reason: 'An unexpected error occurred. Details were written to the local log.',
    next: 'Try again. If it keeps happening, copy Diagnostics into a bug report.',
  },
};

export const en = {
  locale: 'en-US',
  messages,
  errors,
  ui: {
    appName: 'Profile Switcher',
    nav: {
      profiles: 'Profiles',
      settings: 'Settings',
      diagnostics: 'Diagnostics',
      label: 'Main',
      skip: 'Skip to main content',
    },
    common: {
      cancel: 'Cancel',
      close: 'Close',
      save: 'Save',
      saving: 'Saving…',
      create: 'Create profile',
      creating: 'Creating…',
      delete: 'Delete',
      edit: 'Edit',
      details: 'Details',
      choose: 'Choose…',
      clear: 'Clear',
      copy: 'Copy',
      copied: 'Copied to clipboard',
      refresh: 'Refresh',
      loading: 'Loading…',
      dismiss: 'Dismiss',
      notSet: 'Not set',
      never: 'Never',
      yes: 'Yes',
      no: 'No',
      unknown: 'Unknown',
    },
    states: {
      Supported: 'Supported',
      Unsupported: 'Unsupported',
      NeedsVerification: 'Needs verification',
      ApplicationNotFound: 'Not installed',
      ConfigurationError: 'Configuration error',
    },
    isolation: {
      isolated: 'Isolated',
      experimental: 'Own folder · experimental',
      shared: 'Shared · not isolated',
    },
    storageKinds: {
      managed: 'Folder managed by Profile Switcher',
      custom: 'A folder I choose',
      'app-default': "The application's default configuration",
    },
    storageHelp: {
      managed: 'Recommended. A new, empty folder is created for this profile.',
      custom: 'Use a folder you pick. It must not overlap another profile.',
      'app-default':
        'Not isolated. Uses the same settings and sign-in as launching the application normally.',
    },
    colors: {
      slate: 'Slate',
      blue: 'Blue',
      violet: 'Violet',
      green: 'Green',
      amber: 'Amber',
      rose: 'Rose',
      teal: 'Teal',
      orange: 'Orange',
    },
    dashboard: {
      title: 'Profiles',
      subtitle: 'Launch tools with their own configuration and sign-in.',
      newProfile: 'New profile',
      refreshDetection: 'Refresh detection',
      filterAll: 'All',
      filterLabel: 'Filter by application',
      lastLaunched: 'Last launched {time}',
      lastLaunchFailed: 'Last launch failed {time}',
      neverLaunched: 'Not launched yet',
      lastUsedBadge: 'Last launched',
      launch: 'Launch',
      launchShared: 'Open (shared)',
      launching: 'Launching…',
      copyCommand: 'Copy command',
      readOnly: 'Read-only: changes are disabled.',
      empty: 'No profiles for this application yet.',
      experimentalBadge: 'Experimental',
    },
    firstRun: {
      title: 'Set up your first profiles',
      body: 'Each profile gets its own configuration folder, so you can sign in to a different account in each one. Profile Switcher never sees or stores your passwords or tokens — you sign in through the application itself.',
      chooseApp: 'Application',
      templatesTitle: 'Start with templates',
      templatesBody:
        'Creates "Personal" and "Work" profiles, each with its own empty folder. Sign in to each one separately after launching.',
      createTemplates: 'Create Personal and Work',
      custom: 'Create a custom profile instead',
      noIsolatedApps:
        'None of the supported applications offers documented profile isolation on this computer.',
      templatePersonal: 'Personal',
      templateWork: 'Work',
      templatesCreated: 'Created Personal and Work profiles.',
    },
    form: {
      createTitle: 'New profile',
      editTitle: 'Edit profile',
      name: 'Name',
      namePlaceholder: 'e.g. Work, Client A, Personal',
      application: 'Application',
      applicationLocked: 'The application cannot be changed after a profile is created.',
      color: 'Color',
      description: 'Description',
      descriptionPlaceholder: 'Optional note, e.g. which account to sign in with',
      storage: 'Configuration folder',
      storageLocked:
        'The folder cannot be changed after creation, because that would change which sign-in the profile uses. Create a new profile instead.',
      customPath: 'Folder',
      chooseProfileFolder: 'Choose profile folder',
      chooseWorkingDirectory: 'Choose working directory',
      noFolderChosen: 'No folder chosen',
      allowNonEmpty: 'Use this folder even though it already contains files',
      allowNonEmptyHelp: 'Existing files are never modified or deleted by Profile Switcher.',
      workingDirectory: 'Start in folder',
      workingDirectoryHelp: 'The folder the terminal opens in. Defaults to your home folder.',
      advanced: 'Advanced',
      inheritCredentialEnv: 'Pass credential environment variables through',
      inheritCredentialEnvHelp:
        'Off by default. When on, variables such as ANTHROPIC_API_KEY reach the application and override this profile’s own sign-in.',
      isolationDocumented: 'Isolation: {mechanism}',
      isolationNotDocumented: 'Isolation: not supported',
      experimentalStorage:
        'Experimental: Claude Desktop does not officially support separate folders. Read the notes on the profile before relying on it.',
      detected: 'Installed{version}',
      notDetected: 'Not found',
      unsupportedPlatform: 'Not available on this OS',
      errors: {
        nameRequired: 'Enter a name.',
        nameTooLong: 'Use at most {max} characters.',
        nameInvalid: 'Remove control or direction-override characters.',
        nameDuplicate: 'Another {app} profile already uses this name.',
        descriptionTooLong: 'Use at most {max} characters.',
        descriptionInvalid: 'Remove control characters.',
        folderRequired: 'Choose a folder.',
      },
      created: 'Created profile "{name}".',
      saved: 'Saved changes to "{name}".',
    },
    details: {
      title: 'Profile details',
      status: 'Status',
      guaranteed: 'What is guaranteed',
      notGuaranteed: 'What is not guaranteed',
      nextSteps: 'Next steps',
      folder: 'Configuration folder',
      folderAppDefault: 'Application default (not managed by Profile Switcher)',
      workingDirectory: 'Starts in',
      mechanism: 'Isolation mechanism',
      openFolder: 'Open folder',
      verify: 'Verify',
      verifying: 'Verifying…',
      verifyHelp:
        'Runs the installed application to report which folder and account it uses for this profile. Nothing is stored.',
      verificationTitle: 'Verification result',
      verifiedFolderMatch:
        'The application reports this profile’s folder. Configuration isolation confirmed.',
      verifiedFolderMismatch: 'The application reports a different folder: {folder}',
      verifiedFolderNotReported:
        "The application does not report which folder it uses. The sign-in state below is what it reports when started with this profile's folder.",
      signInLabel: 'Sign-in',
      signedIn: 'Signed in',
      signedOut: 'Not signed in',
      signInUnknown: 'Sign-in state not reported',
      account: 'Account',
      organization: 'Organization',
      plan: 'Plan',
      authMethod: 'Method',
      strippedVariables: 'Removed for this launch: {variables}',
      notStored: 'Shown for this session only; never saved by Profile Switcher.',
      copyCommandTitle: 'Run it yourself',
      copyCommandHelp:
        'Copies a command that starts the application with this profile’s configuration.',
      shellLabel: 'Shell',
      shells: {
        posix: 'bash / zsh / sh',
        fish: 'fish',
        powershell: 'PowerShell',
        cmd: 'Command Prompt',
      },
      sessionScoped: 'Sets variables for the current shell session; prefer a new window.',
      lastLaunch: 'Last launch',
      created: 'Created',
      appVersion: 'Version',
      manualCheck: {
        title: 'Your own check',
        help: 'Profile Switcher cannot check which account Claude Desktop uses. After following the steps above, record that you checked this profile. The record applies only to the Claude Desktop version installed now.',
        none: 'Not checked yet.',
        checked: 'You checked this profile {time} with Claude Desktop {version}.',
        unknownVersion: '(version unknown)',
        mark: 'I checked this profile',
        clear: 'Remove my check',
        saved: 'Your check was recorded.',
        cleared: 'Your check was removed.',
      },
    },
    delete: {
      title: 'Delete "{name}"?',
      body: 'The profile will be removed from Profile Switcher.',
      keepsData:
        'Its configuration folder — including any sign-in and history stored there — is NOT deleted. It stays at:',
      noData: 'This profile uses the application’s default configuration, which is not affected.',
      confirm: 'Delete profile',
      deleted: 'Deleted "{name}". Its folder was kept on disk.',
      deletedNoFolder: 'Deleted "{name}".',
    },
    runtime: {
      running: 'Running',
      runningMany: 'Running · {count} instances',
      folderConfirmed: 'folder confirmed',
      folderMismatch: 'Running with a different configuration folder',
      starting: 'Starting…',
      unconfirmed: 'Launched — not confirmed running',
      untracked: 'Launched — running state not tracked',
      pidTitle: 'Process ID {pids}',
      instancesTitle: 'Running instances',
      instancesHelp:
        'Each launch is independent. Profile Switcher closes these only in Switch mode, after you confirm; otherwise close them in their own windows.',
      none: 'No running instances detected.',
      states: {
        starting: 'Starting',
        running: 'Running',
        unconfirmed: 'Not confirmed',
        untracked: 'Not tracked',
      },
      folder: {
        verified: 'Folder confirmed from the running process',
        mismatch: 'Different folder reported by the running process',
        'not-checked': 'Folder set at launch (this OS does not expose process environments)',
      },
      pid: 'PID {pid}',
      started: 'started {time}',
    },
    switchDialog: {
      title: 'Switch to "{name}"?',
      body: 'Switch mode is on for {app}. These profiles are running and will be asked to quit before "{name}" opens:',
      instance: '{profile} · PID {pid}',
      warning:
        'They are asked to quit normally, as if you closed their window; nothing is forced. Unsaved work in them may be lost, and Claude Code sessions in them end.',
      untracked: 'These profiles may also be open, but Profile Switcher cannot close them: {names}',
      close: 'Close and open "{name}"',
      alongside: 'Open alongside',
      closing: 'Closing…',
    },
    launch: {
      success: 'Launched "{name}" in {terminal}.',
      switched: 'Closed {closed} and opened "{name}".',
      successDirect: 'Opened {app} for "{name}".',
      commandCopied: 'Launch command for "{name}" copied. Paste it into a terminal.',
    },
    settings: {
      title: 'Settings',
      appearance: 'Appearance',
      theme: 'Theme',
      themes: { system: 'System', light: 'Light', dark: 'Dark' },
      language: 'Language',
      languages: { en: 'English', fa: 'فارسی' },
      languageHelp: 'Additional languages can be contributed; see CONTRIBUTING.md.',
      launchBehavior: 'Command-line applications',
      launchBehaviorLabel: 'Primary action',
      behaviors: {
        'open-terminal': 'Open a new terminal window',
        'copy-command': 'Copy the launch command to the clipboard',
      },
      terminal: 'Terminal',
      terminals: {
        auto: 'Automatic',
        'macos-terminal': 'Terminal',
        iterm: 'iTerm',
        'x-terminal-emulator': 'System default (x-terminal-emulator)',
        'gnome-terminal': 'GNOME Terminal',
        konsole: 'Konsole',
        'xfce4-terminal': 'Xfce Terminal',
        kitty: 'kitty',
        alacritty: 'Alacritty',
        wezterm: 'WezTerm',
        foot: 'foot',
        xterm: 'XTerm',
        'windows-console': 'Windows console',
      },
      launchModes: 'Running several profiles',
      launchModesHelp:
        'What happens when you launch a profile while other profiles of the same application are running.',
      modes: {
        concurrent: 'Run side by side',
        switch: 'Switch: offer to close the others first',
      },
      modeHelp: {
        concurrent: 'The profile opens in addition to the ones already running. Nothing is closed.',
        switch:
          'Profile Switcher lists the other running profiles and closes them only after you confirm. They are asked to quit normally; nothing is forced.',
      },
      windowsSwitchNote:
        'On Windows, Claude Code in a console window cannot be asked to quit; you will be told to close it yourself.',
      experimental: 'Experimental',
      experimentalHelp:
        'Features that rely on undocumented behavior of other applications. They are off by default and may stop working after an update of those applications.',
      claudeDesktopIsolation: 'Separate Claude Desktop profiles',
      claudeDesktopIsolationHelp:
        "Lets Claude Desktop profiles have their own folder, so several accounts can run side by side. It uses Chromium's --user-data-dir option, which Anthropic does not document or support: an update may break it, browser sign-ins may finish in the wrong window, and Profile Switcher cannot confirm which account each window uses.",
      claudeDesktopIsolationToggle: 'Turn on (I understand the risks above)',
      claudeDesktopIsolationOffNote:
        'Turning it off keeps your Claude Desktop profiles and their folders, but they cannot be opened until it is on again.',
      applications: 'Applications',
      notFound: 'Not found',
      unsupported: 'Not available on this OS',
      foundAt: 'Found at {path}',
      checkedAt: 'Checked {time}',
      about: 'About',
      version: 'Version',
      runtime: 'Runtime',
      license: 'License',
      licenseValue: 'MIT — free and open source',
      privacy: 'Privacy',
      privacyValue: 'Local only. No telemetry, analytics, accounts, or cloud sync.',
      links: {
        repository: 'Source code',
        issues: 'Report an issue',
        license: 'License',
        security: 'Security policy',
        compatibility: 'Compatibility notes',
      },
      saved: 'Settings saved.',
    },
    diagnostics: {
      title: 'Diagnostics',
      subtitle:
        'Local information for troubleshooting. Profile names, account details, and variable values are never included.',
      copy: 'Copy diagnostics',
      openLogs: 'Open logs folder',
      envWarningTitle: 'Credential variables detected',
      envWarning:
        'Profile Switcher was started with {variables} set. They are removed when launching profiles unless a profile opts in to passing them through.',
      providerWarning:
        'Provider or credential-storage variables are active: {variables}. Per-profile sign-in may not apply to the applications that use them.',
    },
    errorBoundary: {
      title: 'The interface hit an unexpected error',
      body: 'Your profiles are safe; nothing was changed. Reload to continue.',
      reload: 'Reload',
    },
    loadFailed: 'Profile Switcher could not load your profiles.',
    retry: 'Try again',
    whatHappened: 'What happened',
    whatNext: 'What you can do',
  },
};

export type Catalog = typeof en;
