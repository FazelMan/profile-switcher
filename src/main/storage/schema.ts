import { z } from 'zod';
import { nameKey, profileIdSchema, profileSchema } from '@shared/domain/profile';
import { DEFAULT_SETTINGS, settingsSchema } from '@shared/domain/settings';

export const CURRENT_SCHEMA_VERSION = 1;

export const metadataDocumentSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    profiles: z.array(profileSchema).max(500),
    settings: settingsSchema,
    lastLaunchedProfileId: profileIdSchema.nullable(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const appDefaults = new Set<string>();
    doc.profiles.forEach((profile, index) => {
      if (ids.has(profile.id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate profile ID',
          path: ['profiles', index, 'id'],
        });
      }
      ids.add(profile.id);
      const key = `${profile.appId}\u0000${nameKey(profile.name)}`;
      if (names.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate profile name',
          path: ['profiles', index, 'name'],
        });
      }
      names.add(key);
      if (profile.storage.kind === 'app-default') {
        if (appDefaults.has(profile.appId)) {
          ctx.addIssue({
            code: 'custom',
            message: 'More than one app-default profile for an application',
            path: ['profiles', index, 'storage'],
          });
        }
        appDefaults.add(profile.appId);
      }
    });
    if (doc.lastLaunchedProfileId !== null && !ids.has(doc.lastLaunchedProfileId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Dangling lastLaunchedProfileId',
        path: ['lastLaunchedProfileId'],
      });
    }
  });

export type MetadataDocument = z.infer<typeof metadataDocumentSchema>;

export function createDefaultDocument(): MetadataDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profiles: [],
    settings: { ...DEFAULT_SETTINGS },
    lastLaunchedProfileId: null,
  };
}

/**
 * A migration converts a document from `fromVersion` to `fromVersion + 1`.
 * Migrations operate on untyped JSON because older shapes no longer match the
 * current schema; the result is validated against the current schema after
 * the last step.
 */
export type Migration = (document: Record<string, unknown>) => Record<string, unknown>;
export type MigrationTable = Readonly<Record<number, Migration>>;

/** No migrations exist yet: version 1 is the first released schema. */
export const MIGRATIONS: MigrationTable = {};

export type MigrationOutcome =
  | { kind: 'current'; document: Record<string, unknown> }
  | { kind: 'migrated'; document: Record<string, unknown>; fromVersion: number }
  | { kind: 'newer'; version: number }
  | { kind: 'invalid'; reason: string };

export function migrateDocument(
  raw: unknown,
  migrations: MigrationTable = MIGRATIONS,
  currentVersion: number = CURRENT_SCHEMA_VERSION,
): MigrationOutcome {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { kind: 'invalid', reason: 'Metadata root is not an object' };
  }
  const version = (raw as Record<string, unknown>).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'invalid', reason: 'Missing or invalid schemaVersion' };
  }
  if (version > currentVersion) return { kind: 'newer', version };
  if (version === currentVersion)
    return { kind: 'current', document: raw as Record<string, unknown> };

  let document = structuredClone(raw) as Record<string, unknown>;
  for (let from = version; from < currentVersion; from += 1) {
    const step = migrations[from];
    if (!step) return { kind: 'invalid', reason: `No migration from schema version ${from}` };
    document = step(document);
    document.schemaVersion = from + 1;
  }
  return { kind: 'migrated', document, fromVersion: version };
}
