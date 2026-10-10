# Manual compatibility test plan

Automated tests use stand-in executables and never touch real accounts. This
plan verifies Profile Switcher against **real** installations of Claude Code
and Claude Desktop, with **real, separate accounts**, on each operating
system. Run it before every release that changes an adapter, and whenever a
new major version of a target application ships. Record results in the table
at the end and in `docs/compatibility.md`.

Use two accounts you control — for example a personal Claude Pro account
("Account P") and a work Team/Enterprise account ("Account W"). Never paste
tokens, cookies, or credential files into bug reports or this document.

## 0. Preparation (every OS)

1. Install the Profile Switcher build under test (DMG / NSIS installer /
   AppImage or DEB). Note its version (Settings → About).
2. Install the target applications from their official sources. Note
   versions: `claude --version`; Claude Desktop → About.
3. Make sure Profile Switcher's own environment has no credential overrides:
   Diagnostics → "Credential overrides present" should read `none`. If it
   lists variables, note that they will be removed from launched profiles
   (the default) and continue.
4. Open Diagnostics and copy the report into the test record.

## 1. Claude Code — concurrent isolated profiles

Repeat on macOS (Apple Silicon and Intel if available), Windows x64, and
Linux x64.

| #    | Step                                                                                                                                                                                            | Expected result                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | First run → choose Claude Code → **Create Personal and Work**.                                                                                                                                  | Two cards, both "Isolated". Details show two different configuration folders under the Profile Switcher data root.                             |
| 1.2  | Open **Details → Verify** on both profiles before launching.                                                                                                                                    | "Configuration isolation confirmed"; "Not signed in" for both; each reports its own folder.                                                    |
| 1.3  | **Launch Personal.** In the new terminal window run `/login` and sign in with **Account P**.                                                                                                    | Terminal opens in the home folder. Card shows **Running** (on Linux also "folder confirmed").                                                  |
| 1.4  | Without closing Personal, **Launch Work.** In its window run `/login` with **Account W**.                                                                                                       | A second, separate terminal window. Both cards show **Running** at the same time. Personal's window is untouched and still usable.             |
| 1.5  | In each window run `/status`.                                                                                                                                                                   | Personal shows Account P; Work shows Account W. Neither shows the other account.                                                               |
| 1.6  | In Profile Switcher, **Verify** both profiles.                                                                                                                                                  | Personal: signed in as Account P. Work: signed in as Account W. Both "folder confirmed".                                                       |
| 1.7  | Send a prompt in **both** windows at the same time.                                                                                                                                             | Both respond. Usage/plan limits reflect the respective account (`/status`).                                                                    |
| 1.8  | **macOS only:** open Keychain Access and search for "Claude Code".                                                                                                                              | Separate credential entries for the two profiles (Claude Code keys the entry to the configuration folder). Do not open or copy their contents. |
| 1.9  | **Linux/Windows only:** check that each profile folder contains its own `.credentials.json` (do not open it), and that `~/.claude/.credentials.json` was not created or changed by these steps. | Each profile has its own file; the default location is untouched.                                                                              |
| 1.10 | Close **Personal's** window only (exit Claude Code or close the terminal).                                                                                                                      | Within a few seconds Personal no longer shows Running. Work still shows Running and still works.                                               |
| 1.11 | **Launch Personal** again.                                                                                                                                                                      | Still signed in as Account P (no new login). Work unaffected.                                                                                  |
| 1.12 | In Work's window run `/logout`. Then **Verify** both.                                                                                                                                           | Work: not signed in. Personal: still signed in as Account P.                                                                                   |
| 1.13 | Quit Profile Switcher while both profiles are running. Reopen it.                                                                                                                               | Quitting is immediate and does not close either window. After reopening, both running profiles are recognized again.                           |
| 1.14 | Launch Personal **twice**.                                                                                                                                                                      | Two independent Personal windows; card shows "Running · 2 instances".                                                                          |
| 1.15 | Set `ANTHROPIC_API_KEY` in the environment Profile Switcher is started from (e.g. launch it from a terminal with the variable set). Launch Work and run `/status`.                              | Work uses its own login, not the API key. Details → Verify lists "Removed for this launch: ANTHROPIC_API_KEY".                                 |
| 1.16 | Edit Work → Advanced → enable **Pass credential environment variables through**. Look at the card and Details.                                                                                  | Status changes to **Needs verification** with a warning that the variable overrides the profile's sign-in.                                     |
| 1.17 | Delete the Work profile.                                                                                                                                                                        | Confirmation states the folder is kept. After deleting, the folder (and its sign-in) still exists on disk.                                     |

Terminal-specific checks:

- **macOS:** repeat 1.3–1.4 with Settings → Terminal set to iTerm (if
  installed).
- **Linux:** repeat 1.3–1.4 with at least two terminal emulators (for example
  GNOME Terminal and Konsole or kitty), selected in Settings → Terminal.
- **Windows:** repeat with both a native install (`claude.exe`) and, if
  available, an npm install (`claude.cmd`). With `claude.cmd` the card shows
  "Launched — running state not tracked" (expected; see
  `docs/compatibility.md`).

## 2. Claude Desktop — default (shared) profile (macOS, Windows)

With **Settings → Experimental → Separate Claude Desktop profiles** off (the
default), Claude Desktop is opened only with its normal, shared data.

| #   | Step                                                                       | Expected result                                                                                                                                    |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Create a Claude Desktop profile.                                           | Only "The application's default configuration" is offered. Card shows **Unsupported**; primary action reads **Open (shared)**.                     |
| 2.2 | Open Details.                                                              | Limitations state that separate data folders are not documented and that opening uses the shared sign-in. No Verify button.                        |
| 2.3 | Click **Open (shared)** with Claude Desktop closed, then again while open. | Claude Desktop opens normally; the second click brings the existing window forward. No second account, no data folder created by Profile Switcher. |
| 2.4 | On Linux, open the New profile form.                                       | Claude Desktop is shown as "Not available on this OS" and cannot be selected.                                                                      |

## 3. Claude Desktop — experimental separate profiles

Profile Switcher can start Claude Desktop with Chromium's
`--user-data-dir=<profile folder>` option. Anthropic does not document or
support it, so the app labels these profiles **Experimental** and **Needs
verification**. This section is how you (and this project) gather evidence.
Use accounts you can afford to sign out of; keep a note of which account
belongs to which profile.

| #    | Step                                                                                                              | Expected result / what to record                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Settings → Experimental: read the warning, tick **Turn on (I understand the risks above)**.                       | The setting is saved. Settings → Running several profiles now also lists Claude Desktop.                                                                                                                                      |
| 3.2  | Create Claude Desktop profiles **Desktop P** and **Desktop W** with "Folder managed by Profile Switcher".         | Form shows the experimental warning. Cards show **Experimental** and **Needs verification**; Details lists every limitation (undocumented option, `claude://` sign-in, …).                                                    |
| 3.3  | Quit Claude Desktop completely. Launch **Desktop P**.                                                             | A Claude Desktop window opens on the sign-in screen (empty folder). The card shows **Running · folder confirmed** within a few seconds.                                                                                       |
| 3.4  | Sign in to Account P in that window. Close no other window.                                                       | Record: did the browser sign-in return to this window? (If a different instance received it, note it.)                                                                                                                        |
| 3.5  | Launch **Desktop W** while P is running (Concurrent mode). Sign in to Account W.                                  | Record: does a second, separate window open (not focus P)? Does the sign-in finish in W's window?                                                                                                                             |
| 3.6  | Check both windows.                                                                                               | Record: each shows its own account; conversations, projects, and MCP servers are separate.                                                                                                                                    |
| 3.7  | Quit P (from its own window or Dock/tray). Then reopen P from Profile Switcher.                                   | W keeps running and signed in. P reopens still signed in to Account P.                                                                                                                                                        |
| 3.8  | Open Claude Desktop the normal way (not through Profile Switcher) or use the default profile's **Open (shared)**. | Record: your normal account and data appear, unchanged by the test.                                                                                                                                                           |
| 3.9  | Settings → Claude Desktop → **Switch**. With P running, launch W.                                                 | A dialog lists P with its PID. **Cancel** changes nothing. **Close and open** quits P normally (it may ask to save) and then opens W. On Windows, if P stays in the tray, the error says P did not close and W is not opened. |
| 3.10 | In Details of each profile, click **I checked this profile** only if 3.4–3.8 all passed.                          | The card shows **Supported** with the isolation still labeled experimental, and the summary says the check was yours.                                                                                                         |
| 3.11 | After the next Claude Desktop update, open Details.                                                               | The profile shows **Needs verification** again ("Claude Desktop has changed since you checked"). Repeat 3.3–3.8.                                                                                                              |
| 3.12 | Turn the experimental setting off.                                                                                | Desktop P/W show as unavailable and cannot be launched; they are never opened with the shared account. Their folders stay on disk.                                                                                            |

Record the Claude Desktop version and OS for every run in §4. Positive results
on real devices are what this project needs before it can describe the
behavior with more confidence in [compatibility.md](compatibility.md); the
feature stays experimental as long as Anthropic does not document it.

## 3a. Switch mode with Claude Code (every OS)

| #    | Step                                                                | Expected result                                                                                                                               |
| ---- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 3a.1 | Settings → Running several profiles → Claude Code → **Switch**.     | Saved.                                                                                                                                        |
| 3a.2 | Launch Personal and wait for **Running**. Launch Work.              | A dialog lists Personal with its PID. Personal is still running.                                                                              |
| 3a.3 | Choose **Open alongside**.                                          | Work starts; Personal keeps running.                                                                                                          |
| 3a.4 | Close Work. Launch Work again and choose **Close and open "Work"**. | macOS/Linux: Personal's Claude Code exits (its terminal shows the process ended), then Work starts. Personal's sign-in is kept for next time. |
| 3a.5 | Windows only: repeat 3a.4.                                          | Windows cannot ask a console program to quit: the error says Personal did not close, and Work is not opened. Close it yourself.               |

## 3c. Codex CLI and Gemini CLI (every OS)

Use two accounts per tool. Repeat for Codex CLI and Gemini CLI.

| #    | Step                                                                                   | Expected result                                                                   |
| ---- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 3c.1 | Create **Personal** and **Work** profiles for the tool.                                | Both show **Supported** and the mechanism (`CODEX_HOME` / `GEMINI_CLI_HOME`).     |
| 3c.2 | Launch Personal; sign in (Codex: ChatGPT or `codex login`; Gemini: Login with Google). | Sign-in completes in that terminal.                                               |
| 3c.3 | Launch Work without closing Personal; sign in with the other account.                  | Both run. Personal is still signed in to its own account.                         |
| 3c.4 | Codex only: **Verify** each profile.                                                   | Each reports "Signed in" and its method.                                          |
| 3c.5 | Check `~/.codex` / `~/.gemini`.                                                        | Not created or changed by these launches.                                         |
| 3c.6 | Quit both, relaunch each.                                                              | Each is still signed in to its own account.                                       |
| 3c.7 | Gemini only: set `GEMINI_FORCE_ENCRYPTED_FILE_STORAGE=true`, restart Profile Switcher. | Gemini profiles show **Needs verification** with the shared-keychain explanation. |

## 3b. Persian interface

| #    | Step                                                                             | Expected result                                                                                    |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 3b.1 | Settings → Language → **فارسی**.                                                 | The whole window switches to Persian and mirrors right to left; the menu bar labels change too.    |
| 3b.2 | Look at paths, commands, PIDs, and versions in Details.                          | Paths and commands read left to right; numbers use Persian digits; dates use the Persian calendar. |
| 3b.3 | Start Profile Switcher for the first time on a system whose language is Persian. | It starts in Persian.                                                                              |

## 4. Results record

Copy this table into the release notes or an issue for each run.

| Date | Profile Switcher | OS / arch | App and version | Sections run | Result | Notes |
| ---- | ---------------- | --------- | --------------- | ------------ | ------ | ----- |
|      |                  |           |                 |              |        |       |
