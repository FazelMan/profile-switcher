# Contributing

Thanks for helping improve Profile Switcher.

## Local setup

```bash
npm ci
npm run dev
```

Node.js 22.12 or newer is required (24 recommended). On Linux, end-to-end
tests need Xvfb when no display is available.

## Before opening a pull request

Run the same checks CI runs:

```bash
npm run lint
npm run format:check   # or `npm run format` to fix
npm run typecheck
npm test
npm run build && xvfb-run -a npx playwright test   # Linux; drop xvfb-run with a display
```

Pull requests should:

- Keep changes focused, with tests for new behavior and bug fixes.
- Keep application-specific logic inside adapters (`src/main/adapters`); UI and
  services must not branch on application IDs.
- Never add a compatibility claim without evidence. A new or changed adapter
  needs a vendor-documented mechanism, an entry in `docs/compatibility.md`
  stating what was verified and how, and the relevant section of
  `docs/manual-test-plan.md` run on real installations.
- Never store, read, copy, or log credentials, tokens, or cookies, and never
  build shell command strings from user input.
- Add user-facing text to the locale catalog (`src/renderer/src/i18n/en.ts`)
  rather than hard-coding it; main-process text goes through message or error
  codes.
- Update `CHANGELOG.md` under `## [Unreleased]`.

## Adding a language

Add a catalog next to `src/renderer/src/i18n/en.ts` with the same shape
(the `Catalog` type enforces completeness), register it in
`src/renderer/src/i18n/index.tsx`, and add the language code to `LANGUAGES` in
`src/shared/domain/settings.ts`.

## Adding an application

See [docs/compatibility.md → Adding an application](docs/compatibility.md#adding-an-application)
and [docs/architecture.md](docs/architecture.md).

## Reporting bugs

Open an issue with steps to reproduce, the expected and actual result, and the
output of Diagnostics → **Copy diagnostics**. Never paste credentials or the
contents of profile folders. Security issues: see [SECURITY.md](SECURITY.md).

By contributing you agree that your contributions are licensed under the MIT
License.
