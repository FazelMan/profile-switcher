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

| Application    | OS                 | Isolation                                | Concurrent profiles | Launch                                      | "Running" detection                                                | Running process's folder checked     |
| -------------- | ------------------ | ---------------------------------------- | ------------------- | ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Claude Code    | Linux x64          | **Supported** (documented; see evidence) | **Supported**       | New terminal window, or copy command        | PID recorded by the launched shell + `/proc` identity              | Yes (`/proc/<pid>/environ`)          |
| Claude Code    | macOS (arm64, x64) | **Supported** (documented)               | **Supported**       | New Terminal/iTerm window, or copy command  | PID recorded by the launched shell + `ps` identity                 | No (macOS hides it); set at launch   |
| Claude Code    | Windows x64        | **Supported** (documented)               | **Supported**       | New console window, or copy command         | Native `claude.exe`: process handle. npm `claude.cmd`: not tracked | No (Windows hides it); set at launch |
| Claude Desktop | macOS, Windows     | **Unsupported**                          | **Unsupported**     | Shared launch only, labeled "Open (shared)" | macOS: not tracked. Windows: process handle                        | n/a                                  |
| Claude Desktop | Linux              | **Unsupported** (no official build)      | **Unsupported**     | Not available                               | n/a                                                                | n/a                                  |

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
  process, with no shared state written by Profile Switcher. Profile Switcher
  never closes, signals, or replaces a running process.
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

### Why isolation is reported as unsupported

- Anthropic documents no supported way to run Claude Desktop with separate
  data folders or with two signed-in accounts at once. Community tools use
  Chromium's `--user-data-dir` flag; that is undocumented for Claude Desktop,
  may change in any update, and cannot be verified from outside the app.
- The `claude://` protocol handler used to complete sign-in is registered once
  per OS, so a second instance's sign-in may return to the wrong window.
- This project has no verified evidence that concurrent instances work on any
  OS.

Profile Switcher therefore never passes undocumented flags, never touches
Claude Desktop's data folder, and offers only an ordinary launch labeled
**Open (shared)**. To switch accounts, sign out and in within Claude Desktop.
[Manual test plan §3](manual-test-plan.md#3-claude-desktop--isolation-research-protocol-not-a-product-feature)
describes how to gather evidence; the adapter can only change after positive,
documented results on every supported OS.

### Detection

- macOS: `/Applications/Claude.app` or `~/Applications/Claude.app`.
- Windows: `%LOCALAPPDATA%\AnthropicClaude\claude.exe`,
  `%LOCALAPPDATA%\Programs\Claude\Claude.exe`, `%ProgramFiles%\Claude\Claude.exe`.
  Microsoft Store (MSIX) installs are not detected.

## Adding an application

Implement `AppAdapter` (`src/main/adapters/types.ts`), register it in
`src/main/adapters/registry.ts`, add its message codes to
`src/shared/domain/messages.ts` and their text to the locale catalog, and add a
row and evidence section to this document. Mark isolation **Supported** only
for vendor-documented mechanisms you have verified.
