import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MetadataStore } from '../../src/main/storage/metadata-store';
import { createDefaultDocument, CURRENT_SCHEMA_VERSION } from '../../src/main/storage/schema';
import type { Profile } from '../../src/shared/domain/profile';
import { nullLogger } from '../helpers/fake-system';

let dir: string;
let file: string;

function store(options: Partial<ConstructorParameters<typeof MetadataStore>[0]> = {}) {
  return new MetadataStore({
    filePath: file,
    logger: nullLogger,
    now: () => new Date('2026-02-03T04:05:06.000Z'),
    ...options,
  });
}

function profile(id: string, name: string): Profile {
  return {
    id,
    appId: 'claude-code',
    name,
    description: '',
    color: 'blue',
    storage: { kind: 'managed' },
    launch: { workingDirectory: null, inheritCredentialEnv: false },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLaunch: null,
    manualCheck: null,
  };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'ps-store-'));
  file = path.join(dir, 'nested', 'metadata.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('MetadataStore', () => {
  it('initializes on first run and persists across instances', async () => {
    const first = store();
    const outcome = await first.load();
    expect(outcome).toMatchObject({ readOnly: false, notices: [] });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(createDefaultDocument());

    await first.update((doc) => ({ ...doc, profiles: [profile('work-a1', 'Work')] }));
    const second = store();
    await second.load();
    expect(second.current().profiles.map((p) => p.name)).toEqual(['Work']);
  });

  it('writes atomically, leaves no temp files, and keeps a backup of the previous version', async () => {
    const s = store();
    await s.load();
    await s.update((doc) => ({ ...doc, profiles: [profile('a-1', 'A')] }));
    await s.update((doc) => ({ ...doc, profiles: [...doc.profiles, profile('b-1', 'B')] }));
    const files = readdirSync(path.dirname(file));
    expect(files.sort()).toEqual(['metadata.json', 'metadata.json.bak']);
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf8')).profiles).toHaveLength(1);
    if (process.platform !== 'win32') {
      const { statSync } = await import('node:fs');
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('serializes concurrent updates so none are lost', async () => {
    const s = store();
    await s.load();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        s.update((doc) => ({
          ...doc,
          profiles: [...doc.profiles, profile(`p-${i}`, `Profile ${i}`)],
        })),
      ),
    );
    const reloaded = store();
    await reloaded.load();
    expect(reloaded.current().profiles).toHaveLength(25);
  });

  it('does not persist invalid documents or partial changes when a mutator fails', async () => {
    const s = store();
    await s.load();
    await expect(
      s.update((doc) => ({ ...doc, profiles: [profile('dup-1', 'A'), profile('dup-1', 'B')] })),
    ).rejects.toMatchObject({
      appError: { code: 'INTERNAL_ERROR' },
    });
    await expect(
      s.update(() => {
        throw new Error('mutator failed');
      }),
    ).rejects.toThrow('mutator failed');
    expect(JSON.parse(readFileSync(file, 'utf8')).profiles).toEqual([]);
    expect(s.current().profiles).toEqual([]);
  });

  it('quarantines corrupt metadata and restores the last good backup', async () => {
    const s = store();
    await s.load();
    await s.update((doc) => ({ ...doc, profiles: [profile('a-1', 'A')] }));
    await s.update((doc) => ({ ...doc, profiles: [...doc.profiles, profile('b-1', 'B')] }));
    writeFileSync(file, '{ this is not json');

    const recovered = store();
    const outcome = await recovered.load();
    expect(outcome.notices.map((n) => n.code)).toEqual(['notice.metadataRecoveredFromBackup']);
    expect(recovered.current().profiles.map((p) => p.name)).toEqual(['A']);
    expect(readdirSync(path.dirname(file))).toContain(
      'metadata.corrupt-2026-02-03T04-05-06-000Z.json',
    );
    expect(
      readFileSync(
        path.join(path.dirname(file), 'metadata.corrupt-2026-02-03T04-05-06-000Z.json'),
        'utf8',
      ),
    ).toBe('{ this is not json');
  });

  it('treats schema-invalid metadata as corrupt and starts fresh when no backup exists', async () => {
    await store().load();
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, profiles: 'nope' }));
    const s = store();
    const outcome = await s.load();
    expect(outcome.notices.map((n) => n.code)).toEqual(['notice.metadataReset']);
    expect(s.current()).toEqual(createDefaultDocument());
    expect(readdirSync(path.dirname(file)).some((f) => f.startsWith('metadata.corrupt-'))).toBe(
      true,
    );
  });

  it('opens metadata from a newer version read-only and never overwrites it', async () => {
    await store().load();
    const newer = JSON.stringify({ schemaVersion: 99, profiles: [], futureField: true });
    writeFileSync(file, newer);
    const s = store();
    const outcome = await s.load();
    expect(outcome.readOnly).toBe(true);
    expect(outcome.notices).toEqual([
      { code: 'notice.metadataNewerSchema', params: { version: 99 } },
    ]);
    await expect(s.update((doc) => doc)).rejects.toMatchObject({
      appError: { code: 'METADATA_READ_ONLY' },
    });
    expect(readFileSync(file, 'utf8')).toBe(newer);
  });

  it('persists migrated documents and keeps the pre-migration file', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(path.dirname(file), { recursive: true });
    const legacy = { schemaVersion: 1, legacyProfiles: [profile('a-1', 'A')] };
    writeFileSync(file, JSON.stringify(legacy));
    // Simulates a future release whose migration table upgrades this shape.
    const s = store({
      migrate: (raw) => {
        const doc = raw as { legacyProfiles: Profile[] };
        return {
          kind: 'migrated',
          fromVersion: 0,
          document: { ...createDefaultDocument(), profiles: doc.legacyProfiles },
        };
      },
    });
    const outcome = await s.load();
    expect(outcome.notices).toEqual([]);
    expect(s.current().profiles.map((p) => p.name)).toEqual(['A']);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      profiles: [{ id: 'a-1' }],
    });
    expect(JSON.parse(readFileSync(`${file}.v0.bak`, 'utf8'))).toEqual(legacy);
    expect(existsSync(file)).toBe(true);
  });
});
