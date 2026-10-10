# Architecture

Profile Switcher is a local-only Electron application: no backend, accounts,
telemetry, or cloud sync. This document describes how it is put together and
why.

## Processes and trust boundaries

```
┌──────────────────────── Renderer (sandboxed) ────────────────────────┐
│ React UI · i18n catalog · client-side validation                     │
│ Talks only to window.profileSwitcher (16 fixed methods)              │
└───────────────▲──────────────────────────────────────────────────────┘
                │ contextBridge (preload: fixed channels, no Node)
┌───────────────┴────────────── Main process ──────────────────────────┐
│ IPC guard: sender check → zod schema → handler → Result              │
│ ProfileService ── MetadataStore (versioned JSON)                     │
│      │         └─ ProcessTracker (runtime records, PID files)         │
│      ├─ AdapterRegistry ── ClaudeCodeAdapter / ClaudeDesktopAdapter   │
│      └─ Launcher ── terminals / quoting / environment                │
│ SystemContext: FileProbe · CommandRunner · ProcessSpawner ·          │
│                ProcessInspector (the only place that touches the OS) │
└──────────────────────────────────────────────────────────────────────┘
```

- **Renderer** (`src/renderer`): React UI. Sandboxed, context-isolated, no Node
  integration, strict CSP, no navigation or pop-ups. It never receives paths it
  can act on directly: actions are expressed as profile IDs.
- **Preload** (`src/preload`): a frozen object whose methods each map to one
  fixed IPC channel. It bundles nothing but Electron's `contextBridge` and
  `ipcRenderer`.
- **Main** (`src/main`): owns the filesystem, process launching, detection,
  persistence, OS integration, and diagnostics.
- **Shared** (`src/shared`): platform-neutral types, zod schemas, message and
  error codes, the IPC contract, and the application identity. ESLint forbids
  Node/Electron imports here and forbids the renderer from importing main.

## IPC

`src/shared/ipc.ts` defines channels and the `ProfileSwitcherApi` type.
`src/main/ipc/schemas.ts` defines a zod tuple schema per channel. Every handler
is registered through `registerIpcHandlers`, which:

1. rejects senders other than the main window's top-level frame showing the
   app's own page (`FORBIDDEN_SENDER`),
2. validates the argument list (extra arguments, unknown keys, bad types →
   `VALIDATION_FAILED`),
3. runs the handler and converts `AppFailure` into a structured error;
   unexpected exceptions become `INTERNAL_ERROR` with no stack trace.

The main process never sends user-facing prose: it sends message and error
codes with parameters, and the renderer's locale catalog (typed against the
code lists) renders "what failed / likely reason / what to do next".

## Applications and adapters

`AppAdapter` (`src/main/adapters/types.ts`) holds everything
application-specific: supported platforms, allowed storage kinds, detection,
compatibility evaluation, launch planning, optional verification, and
copy-command shells. UI and services read capabilities from the adapter and
never branch on application IDs.

Compatibility is a typed state computed from real detection and filesystem
results: `Supported`, `Unsupported`, `NeedsVerification`,
`ApplicationNotFound`, `ConfigurationError`, plus what a launch would provide
(`isolated` or `shared`) and lists of guarantees, limitations, and guidance.

## Launching

A launch plan is either a CLI plan (executable, args, environment changes,
working directory) or a desktop plan (app to open). The `Launcher` executes it:

| OS      | CLI                                                                                                                  | Desktop               |
| ------- | -------------------------------------------------------------------------------------------------------------------- | --------------------- |
| macOS   | Writes a per-launch `.command` script (0700) and runs `open -a Terminal                                              | iTerm <script>`       | `open -a <bundle>` |
| Windows | Spawns `claude.exe` detached (own console window); `.cmd` shims via `cmd.exe /d /s /k` with validated, verbatim args | Spawns the executable |
| Linux   | Spawns the chosen terminal emulator with an argument vector ending in `env -u … NAME=value … claude`                 | Not available         |

Rules that hold everywhere:

- `shell: false` and argument vectors. The only shell texts are fixed scripts
  (PID recording, descriptor closing) that receive values as positional
  arguments, and the macOS script, whose values are validated and
  single-quoted.
- The environment is copied; only the planned variables are set or removed.
- On Linux every spawned process first passes through a fixed bash script that
  closes all inherited descriptors above stderr. Chromium opens many
  descriptors without close-on-exec; without this, launched applications held
  Electron's IPC sockets and storage locks (found during end-to-end testing).
- Launching never stops, signals, or reuses another process.

## Running state

`ProcessTracker` records each launch in the runtime directory:

- macOS/Linux: the launched shell writes its PID to a file and `exec`s the
  application, so the PID belongs to the application.
- Windows (native exe): the spawned process handle is held; its exit event is
  observed.
- Otherwise the launch is "not tracked".

An instance is `running` only if the PID is alive and its command line (or
image name) matches the launched executable; otherwise it is `starting` or
`unconfirmed`. On Linux, `/proc/<pid>/environ` is read for the single
isolation variable to confirm the running process's folder. Records survive a
Profile Switcher restart. The tracker only observes.

## Storage

| Category                   | macOS                                             | Windows                                    | Linux                                      |
| -------------------------- | ------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Metadata (`metadata.json`) | `~/Library/Application Support/Profile Switcher`  | `%APPDATA%\Profile Switcher`               | `$XDG_CONFIG_HOME/profile-switcher`        |
| Managed profile folders    | `…/Profile Switcher/profiles/<app>/<id>`          | `%LOCALAPPDATA%\Profile Switcher\profiles` | `$XDG_DATA_HOME/profile-switcher/profiles` |
| Launch records (runtime)   | `…/Profile Switcher/run`                          | `%LOCALAPPDATA%\Profile Switcher\run`      | `$XDG_STATE_HOME/profile-switcher/run`     |
| Logs                       | `~/Library/Logs/Profile Switcher`                 | `%LOCALAPPDATA%\Profile Switcher\logs`     | `$XDG_STATE_HOME/profile-switcher/logs`    |
| Target application data    | Wherever the application keeps it (never touched) | same                                       | same                                       |

`PROFILE_SWITCHER_DATA_DIR` (absolute) relocates all of them under one root.

The metadata file is versioned (`schemaVersion`) and validated with zod,
including invariants (unique IDs, unique names per app, one app-default
profile per app). Writes are serialized and atomic (temp file, fsync, rename)
with a `.bak` of the previous version. A corrupt file is quarantined and the
backup restored; a file from a newer version opens read-only. Migrations are
table-driven and keep the pre-migration file.

Metadata stores only non-secret data. The schemas are strict, so unknown
fields (such as a credential) are rejected rather than persisted.

## Directory policy

Custom profile folders must be clean absolute paths (no `..`, no UNC paths)
and may not be a filesystem root, the home folder or its ancestors, any
Profile Switcher directory, an application's default data folder (for example
`~/.claude`), or overlap another profile. Symlinks are resolved and
re-checked. A non-empty folder requires explicit approval. Deleting a profile
removes metadata only; its folder is reported and left on disk.

## Testing layers

- `tests/unit` — pure logic with fakes (paths per OS, adapters, launcher per
  OS, quoting with a real `/bin/sh`, IPC security, preload surface, tracker).
- `tests/integration` — real filesystem: metadata recovery and concurrency,
  profile service, real-process launches and concurrent profiles on Linux.
- `tests/component` — React components with an in-memory bridge (jsdom).
- `tests/e2e` — the built Electron app driven by Playwright with stand-in
  Claude Code and terminal executables (Linux).
