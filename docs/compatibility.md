# Compatibility

This document states exactly what Profile Switcher guarantees for each
application and operating system, and the evidence behind each claim. When
something has not been verified, it says so.

## Two kinds of isolation

- **Configuration isolation** — each profile uses its own configuration
  folder, so settings, history, and the credentials the application stores
  there are kept apart. Profile Switcher can set this up and can check it.
- **Account isolation** — which account you are signed in to. Only the target
  application controls this. You sign in through the application's own flow;
  Profile Switcher never sees, stores, copies, or moves passwords, tokens, or
  cookies.

A separate profile does **not** create a separate subscription. Plans, usage
limits, organization policies, and entitlements come from the account you sign
in with.

## Matrix

| Application    | OS                 | Isolation                                                                                                    | Concurrent profiles      | Launch                                                                     | "Running" detection                                                      | Running process's folder checked                                  |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Claude Code    | Linux x64          | **Supported** (documented; see evidence)                                                                     | **Supported**            | New terminal window, or copy command                                       | PID recorded by the launched shell + `/proc` identity                    | Yes (`/proc/<pid>/environ`)                                       |
| Claude Code    | macOS (arm64, x64) | **Supported** (documented)                                                                                   | **Supported**            | New Terminal/iTerm window, or copy command                                 | PID recorded by the launched shell + `ps` identity                       | No (macOS hides it); set at launch                                |
| Claude Code    | Windows x64        | **Supported** (documented)                                                                                   | **Supported**            | New console window, or copy command                                        | Native `claude.exe`: process handle. npm `claude.cmd`: not tracked       | No (Windows hides it); set at launch                              |
| Claude Desktop | macOS, Windows     | **Unsupported** (default profile)                                                                            | **Unsupported**          | Shared launch, labeled "Open (shared)"                                     | macOS: not tracked. Windows: process handle                              | n/a                                                               |
| Claude Desktop | macOS, Windows     | **Experimental, opt-in** (own folder; undocumented) — **Needs verification** until you record your own check | Possible, not guaranteed | `--user-data-dir=<folder>` as last argument (macOS: `open -n -a … --args`) | Main process found by its folder argument (`ps` / CIM), helpers excluded | Yes: the folder is read back from the main process's command line |
| Claude Desktop | Linux              | **Unsupported** (no official build)                                                                          | **Unsupported**          | Not available                                                              | n/a                                                                      | n/a                                                               |

"Documented" means the vendor documents the mechanism. Device verification
status is listed below; macOS and Windows builds are compiled and unit-tested
in CI but have **not** been verified on real devices by this project yet. Run
[the manual test plan](manual-test-plan.md) to do so and record the results
here.

## Claude Code

### Mechanism

Profile Switcher starts Claude Code with `CLAUDE_CONFIG_DIR` set to the
profile's folder. Anthropic documents this for running several accounts at
once ([Authentication → Log in with multiple accounts](https://code.claude.com/docs/en/authentication#log-in-with-multiple-accounts)):

> To stay signed in to multiple accounts at once, such as work and personal
> accounts, give each account its own configuration directory. … Each
> directory has its own settings, session history, and claude.ai login or API
> key.

and for credential storage ([Credential management](https://code.claude.com/docs/en/authentication#credential-management)):

> If you've set the `CLAUDE_CONFIG_DIR` environment variable, Claude Code keeps
> the `.credentials.json` file under that directory instead, including the file
> the macOS fallback writes, and keys the macOS Keychain entry to that directory
> too, so a session with a different `CLAUDE_CONFIG_DIR` reads a different entry.

### What Profile Switcher adds

- **Credential overrides removed.** Claude Code's documented precedence puts
  `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, and
  `ANTHROPIC_PROFILE` above the stored login, so any of them would make every
  profile use the same credential. They are removed from launched profiles
  (also `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` and `CLAUDE_CODE_OAUTH_SCOPES`).
  A profile can opt out ("Pass credential environment variables through"); it
  is then marked **Needs verification**.
- **Provider switches reported.** `CLAUDE_CODE_USE_BEDROCK`,
  `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`, and
  `ANTHROPIC_FEDERATION_RULE_ID` are left alone (they change how your tooling
  works) but mark profiles **Needs verification**, because per-profile sign-in
  does not apply to them.
- **Verify** runs `claude auth status --json` with the profile's exact launch
  environment and compares the `configDirectory` Claude Code reports with the
  profile's folder. It also shows the sign-in state and account the CLI reports
  (shown only; never stored or logged).
- **Concurrency.** Each launch is independent: a new terminal window and a new
  process, with no shared state written by Profile Switcher. In the default
  **Concurrent** launch mode, Profile Switcher never closes, signals, or
  replaces a running process (see [Launch modes](#launch-modes) for Switch).
- **Running state.** A profile is shown as running only when its process is
  found alive _and_ identified as the launched executable. A successful spawn
  alone is never reported as running. Launches that cannot be followed are
  labeled "running state not tracked".

### What is not guaranteed

- Console sign-ins made **without** an API key ("Anthropic profiles") are stored
  outside the configuration folder (documented by Anthropic) and are shared
  between profiles.
- Project-level files (`.claude/settings.json`, `CLAUDE.md`) live in your
  repositories and apply to every profile that opens them.
- Managed (organization) settings on the computer apply to all profiles.
- Subscription and organization entitlements come from the signed-in account.
- A profile that uses "The application's default configuration" is **not**
  isolated; it is labeled "Shared · not isolated".

### Evidence

| Check                                                                                                                                                                                                                       | Environment                                                                                                                                               | Result                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `CLAUDE_CONFIG_DIR` changes the directory Claude Code resolves (`claude auth status` → `configDirectory`, `projectsDirectory`)                                                                                              | Claude Code 2.1.296, Ubuntu 24.04 x64                                                                                                                     | Confirmed; `.claude.json` created inside the profile folder, nothing written to `$HOME` |
| `claude --version` reads/writes no configuration                                                                                                                                                                            | Claude Code 2.1.296, Linux                                                                                                                                | Confirmed (empty `HOME` stayed empty)                                                   |
| A running Claude Code process keeps its invoked path as `argv[0]` (basis for process identification)                                                                                                                        | Claude Code 2.1.296, Linux                                                                                                                                | Confirmed via `/proc/<pid>/cmdline`                                                     |
| Two profiles run concurrently; each process has only its own `CLAUDE_CONFIG_DIR` and no credential variable; launching one leaves the other's folder byte-identical; each closes independently; tracking survives a restart | Linux, production launcher with stand-in Claude Code and terminal (`tests/integration/concurrent-profiles.test.ts`, `tests/e2e/primary-workflow.spec.ts`) | Passing                                                                                 |
| Launched processes inherit no Electron descriptors                                                                                                                                                                          | Linux, Electron 44 (`tests/e2e`)                                                                                                                          | Passing                                                                                 |
| Signing in to two **real** accounts concurrently                                                                                                                                                                            | —                                                                                                                                                         | **Not verified by this project yet** (needs real accounts; see manual test plan §1)     |
| macOS / Windows behavior on real devices                                                                                                                                                                                    | —                                                                                                                                                         | **Not verified yet** (manual test plan §1)                                              |

## Claude Desktop

### Default: shared launch only

- Anthropic documents no supported way to run Claude Desktop with separate
  data folders or with two signed-in accounts at once.
- A Claude Desktop profile using "The application's default configuration"
  opens the app normally, labeled **Open (shared)**. It is reported as
  **Unsupported** isolation. To switch accounts there, sign out and in within
  Claude Desktop.

### Experimental: separate profiles (opt-in)

Turned on in **Settings → Experimental → Separate Claude Desktop profiles**
(off by default; the setting explains the risks before it can be enabled).
Then a Claude Desktop profile can use a managed or chosen folder, and
launching it starts Claude Desktop with Chromium's
`--user-data-dir=<profile folder>` as the **last** argument:

- macOS: `open -n -a <Claude.app> --args --user-data-dir=<folder>`. `open`
  keeps Claude Desktop its own app for permission prompts; `-n` starts a
  separate instance.
- Windows: the detected `claude.exe` is started directly with the argument.

What Profile Switcher can confirm: the running Claude Desktop **main process**
received this profile's folder. It is found by its final argument (`ps` on
macOS, CIM `Win32_Process` on Windows; helper processes, which carry
`--type=`, are ignored), and only then is the profile shown as running.

What it cannot confirm, and why these profiles show **Needs verification**:

- `--user-data-dir` is a Chromium option that Anthropic does not document or
  support for Claude Desktop. An update, or the app restarting itself to
  install one, may not keep it; the app would then open with your normal data
  and account.
- Signing in through the browser returns through a `claude://` link, and the
  OS delivers that link to only one running instance, so a sign-in may finish
  in another profile's window. Sign in to one profile at a time.
- Profile Switcher cannot see which account a window is signed in to.
- Anything Claude Desktop keeps outside its data folder (keychain items, files
  in the home folder) may be shared between profiles.

After following [manual test plan §3](manual-test-plan.md#3-claude-desktop--experimental-separate-profiles),
you can record your own check in the profile's Details. The profile then
shows **Supported** with the isolation still labeled _experimental_ and a
summary saying the check was yours. The record is tied to the Claude Desktop
version detected at the time (macOS: `CFBundleShortVersionString`; Windows:
the newest `app-<version>` folder) and stops counting when that version
changes. Turning the feature off disables these profiles; they are never
opened with the shared account instead.

Profile Switcher never reads, writes, or copies anything inside these folders
or Claude Desktop's normal data, and never handles tokens.

### Detection

- macOS: `/Applications/Claude.app` or `~/Applications/Claude.app`.
- Windows: `%LOCALAPPDATA%\AnthropicClaude\claude.exe`,
  `%LOCALAPPDATA%\Programs\Claude\Claude.exe`, `%ProgramFiles%\Claude\Claude.exe`.
  Microsoft Store (MSIX) installs are not detected.

## Launch modes

Chosen per application in **Settings → Running several profiles**:

- **Concurrent** (default): launching a profile never affects other running
  profiles.
- **Switch**: if other profiles of the same application are running (confirmed
  running by the tracker), nothing is launched yet. A dialog lists exactly
  those instances with **Close and open**, **Open alongside**, and **Cancel**.
  On **Close and open**, each listed instance is re-identified, must belong to
  another profile of the same application, and is asked to quit normally:
  SIGTERM on macOS/Linux, `taskkill /PID <pid>` without `/F` on Windows.
  Profile Switcher waits up to 10 seconds for each to exit. If one does not,
  the new profile is not opened and the error names the profile. Nothing is
  ever forced, and instances that started after the dialog appeared are not
  touched.

| Platform | Claude Code instance                                | Claude Desktop instance (experimental)                                                        |
| -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Linux    | SIGTERM; tested with real processes (stand-in)      | n/a                                                                                           |
| macOS    | SIGTERM (unit-tested; not yet verified on a device) | SIGTERM to the main process (not yet verified)                                                |
| Windows  | Cannot be asked to quit (console); user closes it   | Close message to its windows; the app may stay in the tray, then it is reported as not closed |

## Adding an application

Implement `AppAdapter` (`src/main/adapters/types.ts`), register it in
`src/main/adapters/registry.ts`, add its message codes to
`src/shared/domain/messages.ts` and their text to the locale catalog, and add a
row and evidence section to this document. Mark isolation **Supported** only
for vendor-documented mechanisms you have verified.
