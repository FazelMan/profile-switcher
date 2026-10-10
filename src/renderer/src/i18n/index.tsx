import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AppError } from '@shared/domain/errors';
import type { Message } from '@shared/domain/messages';
import { RTL_LANGUAGES, type Language } from '@shared/domain/settings';
import { en, type Catalog, type ErrorText } from './en';
import { fa } from './fa';

const CATALOGS: Record<Language, Catalog> = { en, fa };

type Params = Record<string, string | number>;

export interface FormatOptions {
  /** Formats numeric parameters for this locale (e.g. Persian digits). */
  numbers?: Intl.NumberFormat;
  /**
   * Wraps each value in Unicode first-strong isolates so names, paths, and
   * versions keep their own direction inside right-to-left text.
   */
  isolate?: boolean;
}

export function format(template: string, params?: Params, options: FormatOptions = {}): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!Object.hasOwn(params, key)) return match;
    const value = params[key];
    const text =
      typeof value === 'number' && options.numbers ? options.numbers.format(value) : String(value);
    return options.isolate ? `\u2068${text}\u2069` : text;
  });
}

export interface I18n {
  ui: Catalog['ui'];
  language: Language;
  locale: string;
  dir: 'ltr' | 'rtl';
  format(template: string, params?: Params): string;
  /** A number in the locale's digits, without grouping (PIDs, counts). */
  number(value: number): string;
  /** A locale-appropriate "a, b and c" list. */
  list(items: string[]): string;
  message(message: Message): string;
  error(error: AppError): ErrorText;
  relativeTime(iso: string, now?: Date): string;
  dateTime(iso: string): string;
}

function createI18n(language: Language): I18n {
  const catalog = CATALOGS[language];
  const rtl = RTL_LANGUAGES.includes(language);
  const relative = new Intl.RelativeTimeFormat(catalog.locale, { numeric: 'auto' });
  const absolute = new Intl.DateTimeFormat(catalog.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const options: FormatOptions = {
    numbers: new Intl.NumberFormat(catalog.locale, { useGrouping: false }),
    isolate: rtl,
  };
  const fill = (template: string, params?: Params) => format(template, params, options);
  const lists = new Intl.ListFormat(catalog.locale, { type: 'conjunction' });
  return {
    ui: catalog.ui,
    language,
    locale: catalog.locale,
    dir: rtl ? 'rtl' : 'ltr',
    format: fill,
    number: (value) => options.numbers?.format(value) ?? String(value),
    list: (items) => lists.format(items),
    message: (m) => fill(catalog.messages[m.code] ?? m.code, m.params),
    error: (e) => {
      const text = catalog.errors[e.code] ?? catalog.errors.INTERNAL_ERROR;
      return {
        title: fill(text.title, e.params),
        reason: fill(text.reason, e.params),
        next: fill(text.next, e.params),
      };
    },
    relativeTime: (iso, now = new Date()) => {
      const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
      const abs = Math.abs(seconds);
      if (abs < 45) return relative.format(0, 'second');
      if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
      if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
      if (abs < 30 * 86_400) return relative.format(Math.round(seconds / 86_400), 'day');
      return absolute.format(new Date(iso));
    },
    dateTime: (iso) => absolute.format(new Date(iso)),
  };
}

const I18nContext = createContext<I18n>(createI18n('en'));

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(() => createI18n(language), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
