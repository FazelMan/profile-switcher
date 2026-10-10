import { describe, expect, it } from 'vitest';
import {
  createProfileInputSchema,
  descriptionSchema,
  generateProfileId,
  nameKey,
  PROFILE_ID_PATTERN,
  profileIdSchema,
  profileNameSchema,
  slugify,
  updateProfileInputSchema,
} from '../../src/shared/domain/profile';

/** Deterministic byte source (mulberry32) so ID tests are reproducible. */
function sequenceBytes(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 0xff;
  };
  return (size: number) => Uint8Array.from({ length: size }, next);
}

describe('profile name validation', () => {
  it('trims and accepts ordinary names, including non-ASCII', () => {
    expect(profileNameSchema.parse('  Work  ')).toBe('Work');
    expect(profileNameSchema.parse('Cliente Ñandú')).toBe('Cliente Ñandú');
    expect(profileNameSchema.parse('仕事')).toBe('仕事');
  });

  it('rejects empty, whitespace-only, and over-long names with stable codes', () => {
    expect(profileNameSchema.safeParse('').error?.issues[0]?.message).toBe('name.required');
    expect(profileNameSchema.safeParse('   ').error?.issues[0]?.message).toBe('name.required');
    expect(profileNameSchema.safeParse('x'.repeat(49)).error?.issues[0]?.message).toBe(
      'name.tooLong',
    );
    expect(profileNameSchema.safeParse('x'.repeat(48)).success).toBe(true);
  });

  it('rejects control characters and bidi overrides that could disguise a name', () => {
    for (const bad of ['Work\u0000', 'Wo\nrk', 'Work\u007f', '‮Work', 'Work⁦x']) {
      expect(profileNameSchema.safeParse(bad).error?.issues[0]?.message).toBe(
        'name.invalidCharacters',
      );
    }
  });
});

describe('description validation', () => {
  it('allows newlines but not other control characters', () => {
    expect(descriptionSchema.parse('line one\nline two')).toBe('line one\nline two');
    expect(descriptionSchema.safeParse('tab\there').success).toBe(false);
    expect(descriptionSchema.safeParse('x'.repeat(281)).success).toBe(false);
  });
});

describe('duplicate-name policy key', () => {
  it('is case-, whitespace-, and width-insensitive', () => {
    expect(nameKey('Work')).toBe(nameKey('  work '));
    expect(nameKey('My   Work')).toBe(nameKey('my work'));
    expect(nameKey('ＷＯＲＫ')).toBe(nameKey('work'));
    expect(nameKey('Work')).not.toBe(nameKey('Works'));
  });
});

describe('profile IDs', () => {
  it('slugifies names into safe path segments', () => {
    expect(slugify('Client A (Acme)')).toBe('client-a-acme');
    expect(slugify('Ñandú Café')).toBe('nandu-cafe');
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('仕事')).toBe('profile');
    expect(slugify('-'.repeat(10))).toBe('profile');
  });

  it('generates IDs that match the safe pattern and avoid existing IDs', () => {
    const random = sequenceBytes(3);
    const existing = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const id = generateProfileId('Work', existing, random);
      expect(id).toMatch(PROFILE_ID_PATTERN);
      expect(id.startsWith('work-')).toBe(true);
      expect(existing.has(id)).toBe(false);
      existing.add(id);
    }
  });

  it('retries when the random suffix collides', () => {
    const first = generateProfileId('Work', new Set(), sequenceBytes(1));
    const id = generateProfileId('Work', new Set([first]), sequenceBytes(1));
    expect(id).not.toBe(first);
  });

  it('rejects IDs that could escape a directory', () => {
    for (const bad of [
      '../x',
      'a/b',
      'a\\b',
      '.',
      '..',
      '',
      'UPPER',
      'x'.repeat(65),
      '-lead',
      'trail-',
    ]) {
      expect(profileIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('create/update input schemas', () => {
  const base = { name: 'Work', appId: 'claude-code', color: 'blue', storage: { kind: 'managed' } };

  it('applies defaults', () => {
    const parsed = createProfileInputSchema.parse(base);
    expect(parsed.description).toBe('');
    expect(parsed.launch).toEqual({});
  });

  it('rejects unknown keys at every level (no smuggled fields such as an executable path)', () => {
    expect(createProfileInputSchema.safeParse({ ...base, executable: '/bin/sh' }).success).toBe(
      false,
    );
    expect(
      createProfileInputSchema.safeParse({ ...base, storage: { kind: 'managed', path: '/tmp' } })
        .success,
    ).toBe(false);
    expect(
      createProfileInputSchema.safeParse({
        ...base,
        launch: { workingDirectory: null, args: ['--evil'] },
      }).success,
    ).toBe(false);
    expect(
      updateProfileInputSchema.safeParse({ id: 'work-abc', storage: { kind: 'managed' } }).success,
    ).toBe(false);
  });

  it('requires an explicit flag to use a non-empty custom folder', () => {
    const parsed = createProfileInputSchema.parse({
      ...base,
      storage: { kind: 'custom', path: '/data/work' },
    });
    expect(parsed.storage).toEqual({ kind: 'custom', path: '/data/work', allowNonEmpty: false });
  });

  it('rejects invalid colors, app IDs, and control characters in paths', () => {
    expect(createProfileInputSchema.safeParse({ ...base, color: 'chartreuse' }).success).toBe(
      false,
    );
    expect(createProfileInputSchema.safeParse({ ...base, appId: '../x' }).success).toBe(false);
    expect(
      createProfileInputSchema.safeParse({
        ...base,
        storage: { kind: 'custom', path: '/tmp/a\nb' },
      }).success,
    ).toBe(false);
  });
});
