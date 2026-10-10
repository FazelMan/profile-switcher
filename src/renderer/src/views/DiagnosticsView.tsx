import { useCallback, useEffect, useState } from 'react';
import { ClipboardCopy, FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react';
import type { DiagnosticsReport } from '@shared/ipc';
import { Button } from '../components/Button';
import { useI18n } from '../i18n';
import { useController } from '../state';

export function DiagnosticsView() {
  const { api, call, snapshot, notify } = useController();
  const { ui, format } = useI18n();
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await call(() => api.getDiagnostics());
    setLoading(false);
    if (result.ok) setReport(result.value);
  }, [api, call]);

  useEffect(() => {
    // Fetch once when the view opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const copy = async () => {
    const result = await call(() => api.copyDiagnostics());
    if (result.ok) notify({ kind: 'success', title: ui.common.copied });
  };

  const credentialVars = snapshot?.environment.credentialOverrideVariables ?? [];
  const providerVars = snapshot?.environment.providerOverrideVariables ?? [];

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>{ui.diagnostics.title}</h1>
          <p className="muted">{ui.diagnostics.subtitle}</p>
        </div>
        <div className="button-row">
          <Button
            icon={<RefreshCw className="icon" aria-hidden="true" />}
            loading={loading}
            onClick={() => void load()}
          >
            {ui.common.refresh}
          </Button>
          <Button
            icon={<FolderOpen className="icon" aria-hidden="true" />}
            onClick={() => void call(() => api.openLogsDirectory())}
          >
            {ui.diagnostics.openLogs}
          </Button>
          <Button
            variant="primary"
            icon={<ClipboardCopy className="icon" aria-hidden="true" />}
            onClick={() => void copy()}
          >
            {ui.diagnostics.copy}
          </Button>
        </div>
      </header>

      {(credentialVars.length > 0 || providerVars.length > 0) && (
        <div className="callout tone-warn" role="note">
          <TriangleAlert className="icon" aria-hidden="true" />
          <div>
            {credentialVars.length > 0 && (
              <>
                <p className="callout-title">{ui.diagnostics.envWarningTitle}</p>
                <p>{format(ui.diagnostics.envWarning, { variables: credentialVars.join(', ') })}</p>
              </>
            )}
            {providerVars.length > 0 && (
              <p>
                {format(ui.diagnostics.providerWarning, { variables: providerVars.join(', ') })}
              </p>
            )}
          </div>
        </div>
      )}

      <pre
        className="diagnostics card"
        tabIndex={0}
        aria-label={ui.diagnostics.title}
        aria-busy={loading}
      >
        {report?.text ?? ui.common.loading}
      </pre>
    </div>
  );
}
