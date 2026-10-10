# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). The release workflow publishes the
section matching the pushed tag as the GitHub Release notes.

## [Unreleased]

## [0.3.0] - 2026-10-10

### Added

- **Codex CLI** profiles: each profile runs `codex` with its own `CODEX_HOME`
  (configuration and sign-in, in `auth.json` or a keyring entry keyed to that
  folder). `OPENAI_API_KEY` and `CODEX_API_KEY` are removed from launches by
  default. **Verify** runs `codex login status`.
- **Gemini CLI** profiles: each profile runs `gemini` with its own
  `GEMINI_CLI_HOME` (settings, history, and Google sign-in in its `.gemini`
  folder). `GEMINI_API_KEY`, `GOOGLE_API_KEY`, and `GOOGLE_CLOUD_ACCESS_TOKEN`
  are removed by default; Vertex AI, service-account credentials, and
  `GEMINI_FORCE_ENCRYPTED_FILE_STORAGE=true` mark profiles Needs verification.
- **Separate sign-in browser per profile** (Settings → Sign-in browser,
  default: your default browser). Claude Code signs in through the browser,
  which approves whichever claude.ai account the browser is signed in to.
  Each profile now opens links, including the sign-in page, in its own
  browser profile (Chromium-based browsers via `--user-data-dir`, Firefox via
  `-profile`), through Claude Code's `BROWSER` variable. macOS and Linux;
  Safari cannot open a separate profile from the command line, so another
  installed browser is used. Profile Switcher never reads browser data.
- **Terminal and Desktop buttons** on Claude Code profiles when Claude Desktop
  is installed: Desktop opens Claude Desktop with that profile's own data
  folder (experimental option, asked for on first use), so the profile has
  the same account in both.

### Changed

- Verification results can say that an application does not report its
  folder.
- Profile list format 3 (`signInBrowser` setting). Format 2 files are
  migrated automatically; 0.2.x opens a format 3 file read-only.

## [0.2.0] - 2026-10-10

### Added

- **Launch modes per application** (Settings → Running several profiles).
  _Concurrent_ (the default) keeps 0.1.0's behavior: launching a profile never
  affects others. _Switch_: when other profiles of the same application are
  running, launching asks first and offers **Close and open**, **Open
  alongside**, or **Cancel**. Only the listed instances are closed, only after
  you confirm, only while they are still identified as the application
  Profile Switcher launched, and only by asking them to quit normally
  (SIGTERM on macOS/Linux, `taskkill` without `/F` on Windows). Nothing is
  forced; a process that does not quit is left running and the new profile is
  not opened.
- **Experimental separate Claude Desktop profiles** (Settings → Experimental,
  off by default). A Claude Desktop profile can have its own folder and is
  started with Chromium's undocumented `--user-data-dir` option, so several
  accounts can run side by side. These profiles are labeled experimental and
  show **Needs verification** until you record your own check, which is tied
  to the installed Claude Desktop version. Profile Switcher confirms the
  running app received the profile's folder (main process found by its final
  argument); it cannot confirm which account a window uses. Turning the
  feature off disables these profiles instead of opening the shared account.
- **Persian (فارسی) interface**, fully translated, laid out right to left,
  with Persian digits and calendar, a bundled Vazirmatn typeface (OFL-1.1),
  and a localized application menu. A new installation starts in the system
  language when it is supported.
- The installed Claude Desktop version is now detected on Windows.

### Changed

- Profile list format 2 (launch modes, experimental settings, per-profile
  manual check). Files from 0.1.x are migrated automatically and the previous
  file is kept as `metadata.json.v1.bak`; 0.1.x opens a format 2 file
  read-only.
- Claude Desktop default-profile texts now point to the experimental option
  instead of saying separate profiles are impossible.

### Security

- Only `src/main/runtime/process-closer.ts` may ask another process to quit,
  and it is reachable only from a confirmed Switch-mode launch. A source test
  enforces this and that nothing anywhere force-kills (no SIGKILL, `/F`,
  `pkill`, or `killall`).

## [0.1.0] - 2026-10-10

First public preview.

### Added

- Profiles for **Claude Code** with separate configuration folders through
  Anthropic's documented `CLAUDE_CONFIG_DIR` mechanism: each profile keeps its
  own settings, history, and sign-in.
- **Concurrent profiles:** launch Personal and Work side by side; launching one
  never closes, replaces, or modifies another. Running state is shown only when
  the launched process is confirmed alive and identified; on Linux the running
  process's own `CLAUDE_CONFIG_DIR` is read back and checked.
- **Verify:** asks the installed Claude Code (`claude auth status --json`) which
  folder and account a profile uses.
- Credential-override variables such as `ANTHROPIC_API_KEY` are removed from
  launched profiles by default so they cannot replace a profile's sign-in.
- **Claude Desktop** profiles with a clearly labeled shared launch. Separate
  accounts and concurrent instances are reported as unsupported because no
  documented mechanism exists.
- Terminal launching on macOS (Terminal, iTerm), Windows (console), and Linux
  (x-terminal-emulator, GNOME Terminal, Konsole, Xfce Terminal, kitty,
  Alacritty, WezTerm, foot, XTerm), plus "copy launch command" for bash/zsh,
  fish, PowerShell, and Command Prompt.
- First-run Personal/Work templates, profile editing, deletion that keeps
  profile folders on disk, settings (theme, launch behavior, terminal),
  diagnostics with redaction, light and dark themes.
- Versioned local metadata with atomic writes, backups, corruption recovery,
  and a read-only mode for files written by newer versions.
- CI on Linux, macOS, and Windows; tag-driven releases with checksums and
  explicit signing status.

### Security

- Sandboxed, context-isolated renderer with a strict Content Security Policy;
  every IPC call is sender-checked and schema-validated.
- Processes are started without a shell from argument vectors; on Linux every
  spawned process starts with only stdin, stdout, and stderr open, so no
  Electron descriptors leak into launched applications.

[Unreleased]: https://github.com/FazelMan/profile-switcher/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/FazelMan/profile-switcher/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/FazelMan/profile-switcher/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/FazelMan/profile-switcher/releases/tag/v0.1.0
