import { describe, expect, it } from 'vitest';
import {
  createDefaultDocument,
  CURRENT_SCHEMA_VERSION,
  metadataDocumentSchema,
  migrateDocument,
} from '../../src/main/storage/schema';
import type { Profile } from '../../src/shared/domain/profile';

function profile(id: string, name: string, overrides: Partial<Profile> = {}): Profile {
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
    ...overrides,
  };
}

describe('migrateDocument', () => {
  it('passes current documents through', () => {
    expect(migrateDocument(createDefaultDocument())).toMatchObject({ kind: 'current' });
  });

  it('refuses documents from a newer version instead of guessing', () => {
    expect(migrateDocument({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toEqual({
      kind: 'newer',
      version: CURRENT_SCHEMA_VERSION + 1,
    });
  });

  it('flags missing or invalid versions as invalid', () => {
    for (const raw of [
      null,
      [],
      'text',
      {},
      { schemaVersion: '1' },
      { schemaVersion: 0 },
      { schemaVersion: 1.5 },
    ]) {
      expect(migrateDocument(raw).kind).toBe('invalid');
    }
  });

  it('applies migrations step by step and stamps each version', () => {
    const migrations = {
      1: (doc: Record<string, unknown>) => ({ ...doc, renamed: doc.old, old: undefined }),
      2: (doc: Record<string, unknown>) => ({ ...doc, added: true }),
    };
    const original = { schemaVersion: 1, old: 'value' };
    const outcome = migrateDocument(original, migrations, 3);
    expect(outcome).toEqual({
      kind: 'migrated',
      fromVersion: 1,
      document: { schemaVersion: 3, renamed: 'value', old: undefined, added: true },
    });
    expect(original).toEqual({ schemaVersion: 1, old: 'value' });
  });

  it('reports a gap in the migration chain', () => {
    expect(migrateDocument({ schemaVersion: 1 }, { 2: (d) => d }, 3)).toEqual({
      kind: 'invalid',
      reason: 'No migration from schema version 1',
    });
  });
});

describe('metadataDocumentSchema invariants', () => {
  const base = createDefaultDocument();

  it('accepts a valid document', () => {
    expect(
      metadataDocumentSchema.safeParse({ ...base, profiles: [profile('work-abc', 'Work')] })
        .success,
    ).toBe(true);
  });

  it('rejects duplicate IDs, duplicate names per app, and multiple app-default profiles', () => {
    expect(
      metadataDocumentSchema.safeParse({
        ...base,
        profiles: [profile('a-1', 'A'), profile('a-1', 'B')],
      }).success,
    ).toBe(false);
    expect(
      metadataDocumentSchema.safeParse({
        ...base,
        profiles: [profile('a-1', 'Work'), profile('a-2', 'work ')],
      }).success,
    ).toBe(false);
    expect(
      metadataDocumentSchema.safeParse({
        ...base,
        profiles: [
          profile('a-1', 'Work'),
          profile('a-2', 'Work', { appId: 'claude-desktop', storage: { kind: 'app-default' } }),
        ],
      }).success,
    ).toBe(true);
    expect(
      metadataDocumentSchema.safeParse({
        ...base,
        profiles: [
          profile('a-1', 'A', { storage: { kind: 'app-default' } }),
          profile('a-2', 'B', { storage: { kind: 'app-default' } }),
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects a dangling lastLaunchedProfileId and unknown fields such as stored secrets', () => {
    expect(
      metadataDocumentSchema.safeParse({ ...base, lastLaunchedProfileId: 'gone-1' }).success,
    ).toBe(false);
    expect(metadataDocumentSchema.safeParse({ ...base, token: 'x' }).success).toBe(false);
    expect(
      metadataDocumentSchema.safeParse({
        ...base,
        profiles: [{ ...profile('a-1', 'A'), credentials: 'x' }],
      }).success,
    ).toBe(false);
  });
});

describe('migrations 1 → 2 → 3', () => {
  it('upgrades a 0.1.x document without changing what existing profiles do', () => {
    const v1 = {
      schemaVersion: 1,
      profiles: [
        {
          id: 'work-abc',
          appId: 'claude-code',
          name: 'Work',
          description: '',
          color: 'blue',
          storage: { kind: 'managed' },
          launch: { workingDirectory: null, inheritCredentialEnv: false },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastLaunch: {
            at: '2026-01-02T00:00:00.000Z',
            outcome: 'started',
            method: 'terminal',
            isolation: 'isolated',
          },
        },
      ],
      settings: {
        theme: 'dark',
        language: 'en',
        cliLaunchBehavior: 'copy-command',
        preferredTerminal: 'auto',
      },
      lastLaunchedProfileId: 'work-abc',
    };
    const outcome = migrateDocument(v1);
    expect(outcome.kind).toBe('migrated');
    if (outcome.kind !== 'migrated') return;
    const parsed = metadataDocumentSchema.parse(outcome.document);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.settings).toEqual({
      theme: 'dark',
      language: 'en',
      cliLaunchBehavior: 'copy-command',
      preferredTerminal: 'auto',
      launchModes: {},
      experimental: { claudeDesktopIsolation: false },
      signInBrowser: 'auto',
    });
    expect(parsed.profiles[0]).toMatchObject({ id: 'work-abc', manualCheck: null });
    expect(parsed.lastLaunchedProfileId).toBe('work-abc');
  });
});
