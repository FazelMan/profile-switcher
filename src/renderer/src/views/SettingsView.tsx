import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import {
  CLI_LAUNCH_BEHAVIORS,
  LANGUAGES,
  THEMES,
  type SettingsPatch,
  type TerminalId,
} from '@shared/domain/settings';
import type { LinkId } from '@shared/links';
import { AppGlyph } from '../components/AppGlyph';
import { Button } from '../components/Button';
import { useI18n } from '../i18n';
import { useController } from '../state';

const ABOUT_LINKS: LinkId[] = ['repository', 'compatibility', 'license', 'security', 'issues'];

export function SettingsView() {
  const { api, call, snapshot, applySnapshot } = useController();
  const { ui, format, relativeTime } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  if (!snapshot) return null;
  const { settings, readOnly, appInfo, environment } = snapshot;

  const update = async (patch: SettingsPatch) => {
    const result = await call(() => api.updateSettings(patch));
    if (result.ok) applySnapshot(result.value);
  };

  const refresh = async () => {
    setRefreshing(true);
    const result = await call(() => api.refreshApps());
    setRefreshing(false);
    if (result.ok) applySnapshot(result.value);
  };

  return (
    <div className="view">
      <header className="view-header">
        <h1>{ui.settings.title}</h1>
      </header>

      <section className="card settings-section" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance">{ui.settings.appearance}</h2>
        <fieldset className="field">
          <legend>{ui.settings.theme}</legend>
          <div className="segmented">
            {THEMES.map((theme) => (
              <label key={theme} className={settings.theme === theme ? 'active' : ''}>
                <input
                  type="radio"
                  name="theme"
                  value={theme}
                  checked={settings.theme === theme}
                  disabled={readOnly}
                  onChange={() => void update({ theme })}
                />
                {ui.settings.themes[theme]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="settings-language">{ui.settings.language}</label>
          <select
            id="settings-language"
            value={settings.language}
            disabled={readOnly || LANGUAGES.length < 2}
            onChange={(event) =>
              void update({ language: event.target.value as (typeof LANGUAGES)[number] })
            }
          >
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {ui.settings.languages[language]}
              </option>
            ))}
          </select>
          <p className="field-help">{ui.settings.languageHelp}</p>
        </div>
      </section>

      <section className="card settings-section" aria-labelledby="settings-launch">
        <h2 id="settings-launch">{ui.settings.launchBehavior}</h2>
        <fieldset className="field">
          <legend>{ui.settings.launchBehaviorLabel}</legend>
          <div className="radio-list">
            {CLI_LAUNCH_BEHAVIORS.map((behavior) => (
              <label key={behavior} className="radio-row">
                <input
                  type="radio"
                  name="cli-launch-behavior"
                  value={behavior}
                  checked={settings.cliLaunchBehavior === behavior}
                  disabled={readOnly}
                  onChange={() => void update({ cliLaunchBehavior: behavior })}
                />
                <span className="radio-title">{ui.settings.behaviors[behavior]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="settings-terminal">{ui.settings.terminal}</label>
          <select
            id="settings-terminal"
            value={
              environment.terminals.includes(settings.preferredTerminal)
                ? settings.preferredTerminal
                : 'auto'
            }
            disabled={readOnly}
            onChange={(event) =>
              void update({ preferredTerminal: event.target.value as TerminalId })
            }
          >
            {environment.terminals.map((terminal) => (
              <option key={terminal} value={terminal}>
                {ui.settings.terminals[terminal]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card settings-section" aria-labelledby="settings-apps">
        <div className="section-header">
          <h2 id="settings-apps">{ui.settings.applications}</h2>
          <Button
            size="sm"
            icon={<RefreshCw className="icon" aria-hidden="true" />}
            loading={refreshing}
            onClick={() => void refresh()}
          >
            {ui.dashboard.refreshDetection}
          </Button>
        </div>
        <ul className="app-list">
          {snapshot.apps.map((app) => (
            <li key={app.id}>
              <span className="app-name">
                <AppGlyph kind={app.kind} />
                {app.displayName}
                {app.detection.version && <span className="muted"> {app.detection.version}</span>}
              </span>
              <span className="muted small">
                {!app.platformSupported
                  ? ui.settings.unsupported
                  : app.detection.executablePath
                    ? format(ui.settings.foundAt, { path: app.detection.executablePath })
                    : ui.settings.notFound}
                {' · '}
                {format(ui.settings.checkedAt, { time: relativeTime(app.detection.checkedAt) })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card settings-section" aria-labelledby="settings-about">
        <h2 id="settings-about">{ui.settings.about}</h2>
        <dl className="kv">
          <dt>{ui.settings.version}</dt>
          <dd>
            {appInfo.name} {appInfo.version}
          </dd>
          <dt>{ui.settings.runtime}</dt>
          <dd>
            Electron {appInfo.electron} · Chromium {appInfo.chrome} · Node {appInfo.node}
          </dd>
          <dt>{ui.settings.license}</dt>
          <dd>{ui.settings.licenseValue}</dd>
          <dt>{ui.settings.privacy}</dt>
          <dd>{ui.settings.privacyValue}</dd>
        </dl>
        <div className="button-row wrap">
          {ABOUT_LINKS.map((id) => (
            <Button
              key={id}
              size="sm"
              variant="ghost"
              icon={<ExternalLink className="icon" aria-hidden="true" />}
              onClick={() => void call(() => api.openLink(id))}
            >
              {ui.settings.links[id as keyof typeof ui.settings.links]}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
