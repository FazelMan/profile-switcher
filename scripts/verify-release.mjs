// Validates release metadata before anything is built or published:
//  - the tag is a semantic version (vX.Y.Z or vX.Y.Z-prerelease)
//  - it matches package.json's version
//  - CHANGELOG.md has a section for that version
// With --notes <file>, writes that CHANGELOG section as the release notes.
//
// Usage: node scripts/verify-release.mjs <tag> [--notes release-notes.md]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tag = args[0] ?? process.env.GITHUB_REF_NAME;
const notesIndex = args.indexOf('--notes');
const notesFile = notesIndex >= 0 ? args[notesIndex + 1] : null;

function fail(message) {
  console.error(`Release check failed: ${message}`);
  process.exit(1);
}

if (!tag) fail('no tag given (argument or GITHUB_REF_NAME)');
const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)$/.exec(tag);
if (!match) fail(`tag "${tag}" is not of the form vX.Y.Z or vX.Y.Z-prerelease`);
const version = match[1];

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== version) {
  fail(`tag ${tag} does not match package.json version ${pkg.version}`);
}

const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split('\n');
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start < 0) fail(`CHANGELOG.md has no "## [${version}]" section`);
let end = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
if (end < 0) end = lines.length;
const notes = lines
  .slice(start + 1, end)
  .filter((line) => !/^\[[^\]]+\]:\s/.test(line))
  .join('\n')
  .trim();
if (!notes) fail(`CHANGELOG.md section for ${version} is empty`);

if (notesFile) await writeFile(notesFile, `${notes}\n`);
console.warn(`Release ${tag} OK (version ${version}, prerelease: ${version.includes('-')})`);
