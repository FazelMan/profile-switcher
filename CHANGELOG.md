# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). The release workflow publishes the
section matching the pushed tag as the GitHub Release notes.

## [Unreleased]

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

[Unreleased]: https://github.com/FazelMan/profile-switcher/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/FazelMan/profile-switcher/releases/tag/v0.1.0
