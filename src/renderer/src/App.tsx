import { Component, useEffect, useState, type ReactNode } from 'react';
import { Activity, Info, Layers, Settings as SettingsIcon, X } from 'lucide-react';
import type { ProfileSwitcherApi } from '@shared/ipc';
import { Button } from './components/Button';
import { ErrorPanel } from './components/ErrorPanel';
import { Toasts } from './components/Toasts';
import { I18nProvider, useI18n } from './i18n';
import { en } from './i18n/en';
import { AppControllerProvider, useController } from './state';
import { DiagnosticsView } from './views/DiagnosticsView';
import { ProfilesView } from './views/ProfilesView';
import { SettingsView } from './views/SettingsView';

type ViewId = 'profiles' | 'settings' | 'diagnostics';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    // The boundary sits outside the i18n provider so it cannot depend on it.
    const text = en.ui.errorBoundary;
    return (
      <div className="fatal" role="alert">
        <h1>{text.title}</h1>
        <p>{text.body}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          {text.reload}
        </Button>
      </div>
    );
  }
}

function useResolvedTheme(theme: 'system' | 'light' | 'dark') {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

/** Keeps <html lang dir> in step with the active language, for layout and screen readers. */
function useDocumentLanguage(locale: string, dir: 'ltr' | 'rtl') {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);
}

function Notices() {
  const { snapshot } = useController();
  const { message, ui } = useI18n();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const notices = (snapshot?.notices ?? []).filter((notice) => !dismissed.includes(notice.code));
  if (notices.length === 0) return null;
  return (
    <div className="notices">
      {notices.map((notice) => (
        <div key={notice.code} className="callout tone-info" role="status">
          <Info className="icon" aria-hidden="true" />
          <p>{message(notice)}</p>
          <button
            type="button"
            className="icon-button"
            aria-label={ui.common.dismiss}
            onClick={() => setDismissed((current) => [...current, notice.code])}
          >
            <X className="icon" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const { snapshot, loadError, reload } = useController();
  const [view, setView] = useState<ViewId>('profiles');
  useResolvedTheme(snapshot?.settings.theme ?? 'system');

  return (
    <I18nProvider language={snapshot?.settings.language ?? 'en'}>
      <ShellContent
        view={view}
        setView={setView}
        loading={!snapshot && !loadError}
        failed={!snapshot && !!loadError}
        retry={reload}
      />
    </I18nProvider>
  );
}

function ShellContent({
  view,
  setView,
  loading,
  failed,
  retry,
}: {
  view: ViewId;
  setView(view: ViewId): void;
  loading: boolean;
  failed: boolean;
  retry(): Promise<void>;
}) {
  const { ui, locale, dir } = useI18n();
  useDocumentLanguage(locale, dir);
  const { loadError, snapshot } = useController();
  const nav: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
    {
      id: 'profiles',
      label: ui.nav.profiles,
      icon: <Layers className="icon" aria-hidden="true" />,
    },
    {
      id: 'settings',
      label: ui.nav.settings,
      icon: <SettingsIcon className="icon" aria-hidden="true" />,
    },
    {
      id: 'diagnostics',
      label: ui.nav.diagnostics,
      icon: <Activity className="icon" aria-hidden="true" />,
    },
  ];

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {ui.nav.skip}
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>{ui.appName}</span>
        </div>
        <nav aria-label={ui.nav.label}>
          <ul className="tabs">
            {nav.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`tab${view === item.id ? ' active' : ''}`}
                  aria-current={view === item.id ? 'page' : undefined}
                  onClick={() => setView(item.id)}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {snapshot?.readOnly && (
          <div className="callout tone-warn" role="status">
            <Info className="icon" aria-hidden="true" />
            <p>{ui.dashboard.readOnly}</p>
          </div>
        )}
        <Notices />
        {loading && (
          <p className="muted center" role="status">
            {ui.common.loading}
          </p>
        )}
        {failed && loadError && (
          <div className="view">
            <h1>{ui.loadFailed}</h1>
            <ErrorPanel error={loadError} />
            <Button variant="primary" onClick={() => void retry()}>
              {ui.retry}
            </Button>
          </div>
        )}
        {snapshot && view === 'profiles' && <ProfilesView />}
        {snapshot && view === 'settings' && <SettingsView />}
        {snapshot && view === 'diagnostics' && <DiagnosticsView />}
      </main>
      <Toasts />
    </div>
  );
}

export function App({ api }: { api: ProfileSwitcherApi }) {
  return (
    <ErrorBoundary>
      <AppControllerProvider api={api}>
        <Shell />
      </AppControllerProvider>
    </ErrorBoundary>
  );
}
