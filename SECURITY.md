# Security policy

## Reporting a vulnerability

Please report security issues **privately**, not in public issues:

1. Use GitHub's private vulnerability reporting (if it is enabled for the
   repository): the repository's
   **Security** tab → **Report a vulnerability**
   (<https://github.com/FazelMan/profile-switcher/security/advisories/new>).
2. If that is unavailable, e-mail the maintainer at the address listed in
   `package.json` with the subject "Profile Switcher security".

Include the affected version, operating system, steps to reproduce, and the
impact you expect. Do **not** include real credentials, tokens, cookies, or
the contents of profile folders; describe them instead.

You can expect an acknowledgement within 7 days and a status update within
30 days. Fixes are released as soon as practical and credited in the
changelog unless you prefer otherwise.

## Supported versions

Only the latest release receives security fixes.

## Scope

In scope, for example:

- Escaping the renderer sandbox or reaching privileged IPC from untrusted
  content.
- Command or argument injection through profile fields, paths, or settings.
- Profile Switcher reading, writing, copying, or logging credentials.
- One profile's launch reading or modifying another profile's data.
- Profile Switcher closing or signaling a process without your confirmation,
  closing a process it did not launch for another profile, or forcing a
  process to terminate.
- Path traversal or writes outside the documented directories.
- Leaking secrets through logs or diagnostics.

Out of scope:

- How a target application (Claude Code, Claude Desktop) stores or protects
  its own credentials — report those to the vendor.
- Attacks that require an attacker who already controls your user account or
  environment variables.

## Design summary

See the [Security model](README.md#security-model) and
[docs/architecture.md](docs/architecture.md) for the full design: sandboxed
renderer, sender-checked and schema-validated IPC, shell-free process
launching, descriptor hygiene on Linux, a single confirmation-gated module
that may ask processes to quit (Switch mode; never forced), strict metadata
schemas, allow-listed external links, and redacted local logs.
