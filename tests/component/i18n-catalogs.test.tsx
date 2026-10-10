import { describe, expect, it } from 'vitest';
import { en } from '../../src/renderer/src/i18n/en';
import { fa } from '../../src/renderer/src/i18n/fa';
import { format } from '../../src/renderer/src/i18n';
import { LANGUAGES, RTL_LANGUAGES } from '../../src/shared/domain/settings';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result.set(path, value);
    else for (const [k, v] of leaves(value, path)) result.set(k, v);
  }
  return result;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Strings that are legitimately identical in both languages (names, code). */
const SAME_IN_BOTH = new Set([
  'locale',
  'ui.appName',
  'ui.settings.languages.en',
  'ui.settings.languages.fa',
  'ui.details.shells.posix',
  'ui.details.shells.fish',
  'ui.details.shells.powershell',
  'ui.details.shells.cmd',
]);

describe('locale catalogs', () => {
  const english = leaves(en as unknown as Tree);
  const persian = leaves(fa as unknown as Tree);

  it('lists every supported language, with Persian written right to left', () => {
    expect(LANGUAGES).toEqual(['en', 'fa']);
    expect(RTL_LANGUAGES).toEqual(['fa']);
  });

  it('Persian has exactly the keys of English', () => {
    expect([...persian.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('Persian uses the same placeholders as English in every string', () => {
    for (const [key, text] of english) {
      expect([key, placeholders(persian.get(key)!)]).toEqual([key, placeholders(text)]);
    }
  });

  it('every Persian string is translated, except names that stay the same', () => {
    const untranslated = [...english]
      .filter(([key, text]) => persian.get(key) === text && !SAME_IN_BOTH.has(key))
      .filter(([key]) => !key.startsWith('ui.settings.terminals.'))
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
    for (const [key, text] of persian) {
      if (SAME_IN_BOTH.has(key) || key.startsWith('ui.settings.terminals.')) continue;
      expect([key, /[؀-ۿ]/.test(text)]).toEqual([key, true]);
    }
  });

  it('never uses a plain space where Persian needs a zero-width non-joiner after "می"', () => {
    for (const [key, text] of persian) {
      expect([key, /(^|[\s«(])(ن?می) [؀-ۿ]/.test(text)]).toEqual([key, false]);
    }
  });
});

describe('format', () => {
  it('formats numbers for the locale and isolates values inside right-to-left text', () => {
    const numbers = new Intl.NumberFormat('fa-IR', { useGrouping: false });
    expect(format('PID {pid}', { pid: 12345 }, { numbers })).toBe('PID ۱۲۳۴۵');
    expect(format('در {path}', { path: '/a/b' }, { isolate: true })).toBe('در ⁨/a/b⁩');
    expect(format('{missing} {x}', { x: 1 })).toBe('{missing} 1');
  });
});
