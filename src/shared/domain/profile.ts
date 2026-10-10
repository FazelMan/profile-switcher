import { z } from 'zod';

export const PROFILE_COLORS = [
  'slate',
  'blue',
  'violet',
  'green',
  'amber',
  'rose',
  'teal',
  'orange',
] as const;
export type ProfileColor = (typeof PROFILE_COLORS)[number];

export const NAME_MAX_LENGTH = 48;
export const DESCRIPTION_MAX_LENGTH = 280;
export const PATH_MAX_LENGTH = 1024;

/**
 * Profile IDs are generated once at creation, never derived from a later
 * rename, and double as the managed directory name. The pattern keeps them
 * safe as a single path segment on every OS (no separators, dots, or
 * reserved characters).
 */
export const PROFILE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const APP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

// Control characters (C0, DEL, C1) plus Unicode bidi overrides, which can be
// used to disguise a profile name.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

export const profileIdSchema = z.string().regex(PROFILE_ID_PATTERN, 'Invalid profile ID');
export const appIdSchema = z.string().regex(APP_ID_PATTERN, 'Invalid application ID');

export const profileNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, 'name.required')
      .max(NAME_MAX_LENGTH, 'name.tooLong')
      .refine((value) => !CONTROL_CHARS.test(value), 'name.invalidCharacters'),
  );

export const descriptionSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(DESCRIPTION_MAX_LENGTH, 'description.tooLong')
      .refine(
        (value) => !CONTROL_CHARS_EXCEPT_NEWLINE.test(value),
        'description.invalidCharacters',
      ),
  );

/**
 * Lexical checks only. Whether a path is absolute, exists, or is safe to use
 * is decided in the main process with the target platform's path rules.
 */
export const pathInputSchema = z
  .string()
  .min(1, 'path.required')
  .max(PATH_MAX_LENGTH, 'path.tooLong')
  .refine((value) => !CONTROL_CHARS.test(value), 'path.invalidCharacters');

export const profileColorSchema = z.enum(PROFILE_COLORS);

export const STORAGE_KINDS = ['managed', 'custom', 'app-default'] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

export const profileStorageSchema = z.discriminatedUnion('kind', [
  /** A directory Profile Switcher creates under its own data root. */
  z.object({ kind: z.literal('managed') }).strict(),
  /** A directory the user chose. */
  z.object({ kind: z.literal('custom'), path: pathInputSchema }).strict(),
  /** The application's normal configuration. Not isolated. */
  z.object({ kind: z.literal('app-default') }).strict(),
]);
export type ProfileStorage = z.infer<typeof profileStorageSchema>;

export const launchOptionsSchema = z
  .object({
    workingDirectory: pathInputSchema.nullable(),
    /**
     * When false (the default), credential-override variables such as
     * ANTHROPIC_API_KEY are removed from the launched process so they cannot
     * silently replace the profile's own sign-in.
     */
    inheritCredentialEnv: z.boolean(),
  })
  .strict();
export type LaunchOptions = z.infer<typeof launchOptionsSchema>;

export const DEFAULT_LAUNCH_OPTIONS: LaunchOptions = {
  workingDirectory: null,
  inheritCredentialEnv: false,
};

export const LAUNCH_METHODS = ['terminal', 'direct'] as const;
export type LaunchMethod = (typeof LAUNCH_METHODS)[number];

/**
 * - `isolated`: a separate configuration through a mechanism the vendor documents.
 * - `experimental`: a separate folder through undocumented application
 *   behavior; whether accounts really stay apart is not guaranteed.
 * - `shared`: the application's normal configuration.
 */
export const ISOLATION_LEVELS = ['isolated', 'experimental', 'shared'] as const;
export type IsolationLevel = (typeof ISOLATION_LEVELS)[number];

export const lastLaunchSchema = z
  .object({
    at: z.iso.datetime(),
    outcome: z.enum(['started', 'failed']),
    method: z.enum(LAUNCH_METHODS).nullable(),
    isolation: z.enum(ISOLATION_LEVELS),
    errorCode: z.string().max(64).optional(),
  })
  .strict();
export type LastLaunch = z.infer<typeof lastLaunchSchema>;

/**
 * The user's own record that they checked an experimental profile keeps its
 * own sign-in (docs/manual-test-plan.md). It counts only while the
 * application version is unchanged, and the UI presents it as the user's
 * observation, not as a guarantee.
 */
export const manualCheckSchema = z
  .object({
    at: z.iso.datetime(),
    appVersion: z.string().max(64).nullable(),
  })
  .strict();
export type ManualCheck = z.infer<typeof manualCheckSchema>;

export const profileSchema = z
  .object({
    id: profileIdSchema,
    appId: appIdSchema,
    name: profileNameSchema,
    description: descriptionSchema,
    color: profileColorSchema,
    storage: profileStorageSchema,
    launch: launchOptionsSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastLaunch: lastLaunchSchema.nullable(),
    manualCheck: manualCheckSchema.nullable(),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;

export const createProfileInputSchema = z
  .object({
    name: profileNameSchema,
    appId: appIdSchema,
    color: profileColorSchema,
    description: descriptionSchema.default(''),
    storage: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('managed') }).strict(),
      z
        .object({
          kind: z.literal('custom'),
          path: pathInputSchema,
          /** Explicit user approval to use a directory that already has files. */
          allowNonEmpty: z.boolean().default(false),
        })
        .strict(),
      z.object({ kind: z.literal('app-default') }).strict(),
    ]),
    launch: launchOptionsSchema.partial().default({}),
  })
  .strict();
export type CreateProfileInput = z.input<typeof createProfileInputSchema>;
export type CreateProfileRequest = z.output<typeof createProfileInputSchema>;

/**
 * Storage cannot be changed after creation: moving a profile to a different
 * directory would silently swap which sign-in it uses. Create a new profile
 * instead.
 */
export const updateProfileInputSchema = z
  .object({
    id: profileIdSchema,
    name: profileNameSchema.optional(),
    description: descriptionSchema.optional(),
    color: profileColorSchema.optional(),
    launch: launchOptionsSchema.partial().optional(),
  })
  .strict();
export type UpdateProfileInput = z.input<typeof updateProfileInputSchema>;
export type UpdateProfileRequest = z.output<typeof updateProfileInputSchema>;

/** Case- and whitespace-insensitive key used for the duplicate-name policy. */
export function nameKey(name: string): string {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

/** Converts a display name into a short slug used as the readable ID prefix. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
  return slug || 'profile';
}

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generates a readable, collision-resistant ID such as `work-k3m9tq`.
 * `randomBytes` is injected so the function stays platform-neutral and
 * deterministic in tests.
 */
export function generateProfileId(
  name: string,
  existingIds: ReadonlySet<string>,
  randomBytes: (size: number) => Uint8Array,
): string {
  const prefix = slugify(name);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const bytes = randomBytes(6);
    let suffix = '';
    for (const byte of bytes) suffix += ID_ALPHABET[byte % ID_ALPHABET.length];
    const candidate = `${prefix}-${suffix}`;
    if (!existingIds.has(candidate) && PROFILE_ID_PATTERN.test(candidate)) return candidate;
  }
  throw new Error('Unable to generate a unique profile ID');
}
