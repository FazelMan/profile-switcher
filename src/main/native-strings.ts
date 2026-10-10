import type { Language } from '@shared/domain/settings';

/**
 * Text shown by native UI that the main process builds itself (the
 * application menu and file dialogs). Everything else is translated in the
 * renderer's catalogs.
 */
export interface NativeStrings {
  menu: {
    file: string;
    edit: string;
    view: string;
    window: string;
    quit: string;
    close: string;
    undo: string;
    redo: string;
    cut: string;
    copy: string;
    paste: string;
    selectAll: string;
    reload: string;
    toggleDevTools: string;
    resetZoom: string;
    zoomIn: string;
    zoomOut: string;
    toggleFullScreen: string;
    minimize: string;
    zoom: string;
    front: string;
    about: string;
    services: string;
    hide: string;
    hideOthers: string;
    unhide: string;
  };
  dialogs: {
    chooseProfileFolder: string;
    chooseWorkingDirectory: string;
    startupFailedTitle: string;
    startupFailedBody: string;
  };
}

const en: NativeStrings = {
  menu: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    quit: 'Quit',
    close: 'Close Window',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    reload: 'Reload',
    toggleDevTools: 'Toggle Developer Tools',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    toggleFullScreen: 'Toggle Full Screen',
    minimize: 'Minimize',
    zoom: 'Zoom',
    front: 'Bring All to Front',
    about: 'About {app}',
    services: 'Services',
    hide: 'Hide {app}',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
  },
  dialogs: {
    chooseProfileFolder: 'Choose a profile folder',
    chooseWorkingDirectory: 'Choose a working directory',
    startupFailedTitle: '{app} could not start',
    startupFailedBody:
      'Profile Switcher failed to initialize its local data. Details were written to the log folder:\n{path}',
  },
};

const fa: NativeStrings = {
  menu: {
    file: 'فایل',
    edit: 'ویرایش',
    view: 'نما',
    window: 'پنجره',
    quit: 'خروج',
    close: 'بستن پنجره',
    undo: 'واگرد',
    redo: 'انجام دوباره',
    cut: 'برش',
    copy: 'رونوشت',
    paste: 'چسباندن',
    selectAll: 'انتخاب همه',
    reload: 'بارگذاری دوباره',
    toggleDevTools: 'ابزارهای توسعه‌دهنده',
    resetZoom: 'اندازهٔ واقعی',
    zoomIn: 'بزرگ‌نمایی',
    zoomOut: 'کوچک‌نمایی',
    toggleFullScreen: 'تمام‌صفحه',
    minimize: 'کوچک کردن',
    zoom: 'بزرگ کردن',
    front: 'آوردن همه به جلو',
    about: 'دربارهٔ {app}',
    services: 'سرویس‌ها',
    hide: 'پنهان کردن {app}',
    hideOthers: 'پنهان کردن بقیه',
    unhide: 'نمایش همه',
  },
  dialogs: {
    chooseProfileFolder: 'انتخاب پوشهٔ پروفایل',
    chooseWorkingDirectory: 'انتخاب پوشهٔ کاری',
    startupFailedTitle: '{app} اجرا نشد',
    startupFailedBody:
      'Profile Switcher نتوانست داده‌های محلی خود را آماده کند. جزئیات در پوشهٔ گزارش‌ها نوشته شد:\n{path}',
  },
};

const STRINGS: Record<Language, NativeStrings> = { en, fa };

export function nativeStrings(language: Language): NativeStrings {
  return STRINGS[language];
}

/** Picks a supported language from the OS's preferred languages (most preferred first). */
export function languageFromSystem(preferred: readonly string[]): Language {
  const first = preferred[0]?.toLowerCase() ?? '';
  return first === 'fa' || first.startsWith('fa-') ? 'fa' : 'en';
}

export function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? (params[key] ?? match) : match,
  );
}
