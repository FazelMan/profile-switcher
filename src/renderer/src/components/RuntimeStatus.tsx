import { CircleDot, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { InstanceStatus } from '@shared/ipc';
import { useI18n } from '../i18n';

/**
 * Compact running indicator for a profile card. "Running" appears only for
 * instances the main process confirmed as alive and identified; a launch
 * that merely started a terminal is shown as such, never as running.
 */
export function RuntimeIndicator({ instances }: { instances: InstanceStatus[] }) {
  const { ui, format } = useI18n();
  const running = instances.filter((i) => i.state === 'running');
  if (running.length > 0) {
    const mismatch = running.some((i) => i.configDirectory === 'mismatch');
    const verified = running.every((i) => i.configDirectory === 'verified');
    const pids = running.map((i) => i.pid).join(', ');
    return (
      <p
        className={`runtime ${mismatch ? 'runtime-danger' : 'runtime-ok'}`}
        title={format(ui.runtime.pidTitle, { pids })}
        data-testid="runtime-indicator"
      >
        {mismatch ? (
          <TriangleAlert className="icon" aria-hidden="true" />
        ) : (
          <CircleDot className="icon" aria-hidden="true" />
        )}
        {mismatch
          ? ui.runtime.folderMismatch
          : running.length > 1
            ? format(ui.runtime.runningMany, { count: running.length })
            : ui.runtime.running}
        {!mismatch && verified && <span className="muted"> · {ui.runtime.folderConfirmed}</span>}
      </p>
    );
  }
  if (instances.some((i) => i.state === 'starting')) {
    return (
      <p className="runtime muted" data-testid="runtime-indicator">
        <LoaderCircle className="icon spin" aria-hidden="true" />
        {ui.runtime.starting}
      </p>
    );
  }
  if (instances.some((i) => i.state === 'unconfirmed')) {
    return (
      <p className="runtime muted" data-testid="runtime-indicator">
        {ui.runtime.unconfirmed}
      </p>
    );
  }
  if (instances.some((i) => i.state === 'untracked')) {
    return (
      <p className="runtime muted" data-testid="runtime-indicator">
        {ui.runtime.untracked}
      </p>
    );
  }
  return null;
}

/** Instance list for the details dialog. */
export function InstanceList({ instances }: { instances: InstanceStatus[] }) {
  const { ui, format, relativeTime } = useI18n();
  return (
    <section className="instances">
      <h3>{ui.runtime.instancesTitle}</h3>
      <p className="field-help">{ui.runtime.instancesHelp}</p>
      {instances.length === 0 ? (
        <p className="muted small">{ui.runtime.none}</p>
      ) : (
        <ul>
          {instances.map((instance) => (
            <li
              key={instance.launchId}
              className={instance.configDirectory === 'mismatch' ? 'text-danger' : undefined}
            >
              <strong>{ui.runtime.states[instance.state]}</strong>
              {instance.pid !== null && (
                <> · {format(ui.runtime.pid, { pid: instance.pid })}</>
              )} · {format(ui.runtime.started, { time: relativeTime(instance.startedAt) })}
              {instance.state === 'running' && (
                <span className="block small muted">
                  {ui.runtime.folder[instance.configDirectory]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
