import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AppError } from '@shared/domain/errors';
import type { Message } from '@shared/domain/messages';
import type { Language } from '@shared/domain/settings';
import { en, type Catalog, type ErrorText } from './en';

const CATALOGS: Record<Language, Catalog> = { en };

export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : match,
  );
}

export interface I18n {
  ui: Catalog['ui'];
  locale: string;
  format: typeof format;
  message(message: Message): string;
  error(error: AppError): ErrorText;
  relativeTime(iso: string, now?: Date): string;
  dateTime(iso: string): string;
}

function createI18n(language: Language): I18n {
  const catalog = CATALOGS[language];
  const relative = new Intl.RelativeTimeFormat(catalog.locale, { numeric: 'auto' });
  const absolute = new Intl.DateTimeFormat(catalog.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return {
    ui: catalog.ui,
    locale: catalog.locale,
    format,
    message: (m) => format(catalog.messages[m.code] ?? m.code, m.params),
    error: (e) => {
      const text = catalog.errors[e.code] ?? catalog.errors.INTERNAL_ERROR;
      return {
        title: format(text.title, e.params),
        reason: format(text.reason, e.params),
        next: format(text.next, e.params),
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
