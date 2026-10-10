import { useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import type { ProfileColor } from '@shared/domain/profile';
import { useI18n } from '../i18n';
import { useController } from '../state';
import { AppGlyph } from './AppGlyph';
import { Button } from './Button';

/**
 * First-run panel. Offers "Personal" and "Work" templates for applications
 * with documented isolation. The templates are plain local profiles with
 * their own empty folders — not accounts — and the copy says so.
 */
export function FirstRun({ onCustom }: { onCustom(appId: string | undefined): void }) {
  const { api, call, snapshot, applySnapshot, notify } = useController();
  const { ui, format, message } = useI18n();
  const candidates = (snapshot?.apps ?? []).filter(
    (app) => app.platformSupported && app.isolationDocumented,
  );
  const [appId, setAppId] = useState<string | undefined>(candidates[0]?.id);
  const [creating, setCreating] = useState(false);
  const readOnly = snapshot?.readOnly ?? false;

  const createTemplates = async () => {
    if (!appId) return;
    setCreating(true);
    const templates: Array<{ name: string; color: ProfileColor }> = [
      { name: ui.firstRun.templatePersonal, color: 'blue' },
      { name: ui.firstRun.templateWork, color: 'violet' },
    ];
    for (const template of templates) {
      const result = await call(() =>
        api.createProfile({
          name: template.name,
          appId,
          color: template.color,
          storage: { kind: 'managed' },
        }),
      );
      if (!result.ok) {
        setCreating(false);
        const refreshed = await api.getSnapshot().catch(() => null);
        if (refreshed?.ok) applySnapshot(refreshed.value);
        return;
      }
      applySnapshot(result.value.snapshot);
    }
    setCreating(false);
    notify({ kind: 'success', title: ui.firstRun.templatesCreated });
  };

  return (
    <section className="first-run card" aria-labelledby="first-run-title">
      <div className="first-run-icon" aria-hidden="true">
        <Layers className="icon" />
      </div>
      <h2 id="first-run-title">{ui.firstRun.title}</h2>
      <p className="lead">{ui.firstRun.body}</p>

      {candidates.length === 0 ? (
        <p className="muted">{ui.firstRun.noIsolatedApps}</p>
      ) : (
        <>
          <fieldset className="field">
            <legend>{ui.firstRun.chooseApp}</legend>
            <div className="choice-grid">
              {candidates.map((app) => (
                <label key={app.id} className={`choice-card${appId === app.id ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="first-run-app"
                    value={app.id}
                    checked={appId === app.id}
                    onChange={() => setAppId(app.id)}
                  />
                  <span className="choice-title">
                    <AppGlyph kind={app.kind} />
                    {app.displayName}
                  </span>
                  <span className="choice-meta">
                    {format(ui.form.isolationDocumented, { mechanism: message(app.mechanism) })}
                  </span>
                  <span className="choice-meta">
                    {app.detection.status === 'found'
                      ? format(ui.form.detected, {
                          version: app.detection.version ? ` · ${app.detection.version}` : '',
                        })
                      : ui.form.notDetected}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="template-box">
            <h3>{ui.firstRun.templatesTitle}</h3>
            <p className="muted">{ui.firstRun.templatesBody}</p>
            <Button
              variant="primary"
              icon={<Plus className="icon" aria-hidden="true" />}
              loading={creating}
              disabled={readOnly || !appId}
              onClick={() => void createTemplates()}
            >
              {ui.firstRun.createTemplates}
            </Button>
          </div>
        </>
      )}
      <Button variant="ghost" disabled={readOnly} onClick={() => onCustom(appId)}>
        {ui.firstRun.custom}
      </Button>
    </section>
  );
}
