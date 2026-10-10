import type { DiagnosticsReport, Snapshot } from '@shared/ipc';
import type { AppPaths } from '../paths';
import type { Redactor } from './redact';

/**
 * Plain-text diagnostics suitable for pasting into a bug report. Contains
 * versions, paths (home directory shown as ~), detection results, and
 * per-profile states listed by position. It deliberately omits profile
 * names, IDs (which are derived from names), descriptions, environment
 * variable values, and account details.
 */
export function buildDiagnosticsReport(
  snapshot: Snapshot,
  paths: AppPaths,
  redactor: Redactor,
  now: Date,
): DiagnosticsReport {
  const lines: string[] = [];
  const { appInfo, environment } = snapshot;
  lines.push(`${appInfo.name} ${appInfo.version} (${appInfo.appId})`);
  lines.push(`Electron ${appInfo.electron} · Chromium ${appInfo.chrome} · Node ${appInfo.node}`);
  lines.push(`Platform: ${environment.platform} ${environment.arch}`);
  lines.push(`Generated: ${now.toISOString()}`);
  lines.push('');
  lines.push('Paths');
  lines.push(`  Metadata:  ${paths.metadataFile}`);
  lines.push(`  Profiles:  ${paths.profilesRoot}`);
  lines.push(`  Logs:      ${paths.logsDir}`);
  if (paths.overrideRoot) lines.push(`  Override:  PROFILE_SWITCHER_DATA_DIR is set`);
  lines.push(
    `  Metadata read-only: ${snapshot.readOnly ? 'yes (written by a newer version)' : 'no'}`,
  );
  lines.push('');
  lines.push('Applications');
  for (const app of snapshot.apps) {
    const d = app.detection;
    lines.push(
      `  ${app.id}: ${d.status}${d.version ? ` v${d.version}` : ''}${d.executablePath ? ` at ${d.executablePath}` : ''}` +
        `${d.source ? ` (${d.source})` : ''}; platform supported: ${app.platformSupported ? 'yes' : 'no'}; ` +
        `documented isolation: ${app.isolationDocumented ? 'yes' : 'no'}` +
        `${app.experimental ? `; experimental isolation: ${app.experimental.enabled ? 'on' : 'off'}` : ''}`,
    );
  }
  lines.push('');
  lines.push('Environment (variable names only)');
  lines.push(
    `  Credential overrides present: ${environment.credentialOverrideVariables.join(', ') || 'none'}`,
  );
  lines.push(
    `  Provider overrides active:    ${environment.providerOverrideVariables.join(', ') || 'none'}`,
  );
  lines.push('');
  lines.push(`Profiles (${snapshot.profiles.length})`);
  for (const [index, profile] of snapshot.profiles.entries()) {
    const last = profile.lastLaunch
      ? `${profile.lastLaunch.outcome}${profile.lastLaunch.errorCode ? ` (${profile.lastLaunch.errorCode})` : ''} at ${profile.lastLaunch.at}`
      : 'never';
    lines.push(
      `  #${index + 1}: app=${profile.appId} storage=${profile.storage.kind} state=${profile.compatibility.state} ` +
        `isolation=${profile.compatibility.launch.isolation} ` +
        `inheritCredentialEnv=${profile.launch.inheritCredentialEnv} lastLaunch=${last}` +
        `${profile.manualCheck ? ` manualCheck=${profile.manualCheck.appVersion ?? 'unknown-version'}` : ''}`,
    );
  }
  lines.push('');
  lines.push('Settings');
  lines.push(`  ${JSON.stringify(snapshot.settings)}`);

  return {
    generatedAt: now.toISOString(),
    text: redactor.text(lines.join('\n')),
    paths: {
      metadataFile: paths.metadataFile,
      profilesRoot: paths.profilesRoot,
      logsDirectory: paths.logsDir,
    },
  };
}
