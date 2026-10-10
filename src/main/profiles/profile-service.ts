import { AppFailure } from '@shared/domain/errors';
import type {
  AppSummary,
  CompatibilityReport,
  DetectionResult,
} from '@shared/domain/compatibility';
import type { Message } from '@shared/domain/messages';
import {
  generateProfileId,
  nameKey,
  type CreateProfileRequest,
  type LastLaunch,
  type Profile,
  type UpdateProfileRequest,
} from '@shared/domain/profile';
import type { Settings, SettingsPatch } from '@shared/domain/settings';
import type {
  AppInfo,
  CommandShell,
  EnvironmentSummary,
  LaunchReport,
  ProfileView,
  RuntimeSnapshot,
  Snapshot,
  VerificationReport,
} from '@shared/ipc';
import type { AdapterRegistry } from '../adapters/registry';
import type { AppAdapter, ProfileFsState } from '../adapters/types';
import type { Logger } from '../diagnostics/logger';
import { buildCopyCommand } from '../launch/commands';
import {
  activeProviderVariables,
  CLAUDE_CREDENTIAL_OVERRIDE_VARS,
  presentVariables,
} from '../launch/environment';
import type { Launcher } from '../launch/launcher';
import { terminalIdsFor } from '../launch/terminals';
import { UnsafeValueError } from '../launch/quoting';
import { ownedRoots, type AppPaths } from '../paths';
import { isStrictlyInside, isSupportedPlatform, pathApiFor } from '../platform';
import type { ProcessTracker } from '../runtime/process-tracker';
import type { MetadataStore } from '../storage/metadata-store';
import type { MetadataDocument } from '../storage/schema';
import type { SystemContext } from '../system';
import {
  createPrivateDirectory,
  rollbackCreatedDirectories,
  validateCustomDirectory,
  validateWorkingDirectory,
} from './directory-policy';

export interface ProfileServiceDeps {
  store: MetadataStore;
  registry: AdapterRegistry;
  system: SystemContext;
  paths: AppPaths;
  launcher: Launcher;
  tracker: ProcessTracker;
  logger: Logger;
  appInfo: AppInfo;
  randomBytes: (size: number) => Uint8Array;
  now?: () => Date;
}

/** Fallback report for profiles whose application has no registered adapter (e.g. after a downgrade). */
function unknownAppReport(appId: string): CompatibilityReport {
  return {
    state: 'ConfigurationError',
    launch: { available: false, isolation: 'shared' },
    summary: { code: 'compat.unknownApp.summary', params: { app: appId } },
    guarantees: [],
    limitations: [],
    guidance: [],
  };
}

export class ProfileService {
  private readonly deps: ProfileServiceDeps;
  private readonly now: () => Date;
  private readonly detections = new Map<string, DetectionResult>();
  private notices: Message[] = [];
  private detectionInFlight: Promise<void> | null = null;

  constructor(deps: ProfileServiceDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    const outcome = await this.deps.store.load();
    this.notices = outcome.notices;
    await this.deps.tracker
      .restore()
      .catch((error: unknown) => this.deps.logger.warn('runtime.restore-failed', { error }));
    await this.refreshDetection();
  }

  /** Re-runs application detection. Concurrent callers share one run. */
  async refreshDetection(): Promise<void> {
    if (!this.detectionInFlight) {
      this.detectionInFlight = (async () => {
        const results = await Promise.all(
          this.deps.registry.list().map(async (adapter) => {
            try {
              return [adapter.id, await adapter.detect(this.deps.system)] as const;
            } catch (error) {
              this.deps.logger.error('detection.failed', { app: adapter.id, error });
              const failed: DetectionResult = {
                status: 'not-found',
                executablePath: null,
                version: null,
                source: null,
                checkedAt: this.now().toISOString(),
              };
              return [adapter.id, failed] as const;
            }
          }),
        );
        for (const [id, result] of results) this.detections.set(id, result);
        this.deps.logger.info('detection.completed', {
          results: results.map(([id, r]) => ({
            id,
            status: r.status,
            version: r.version,
            source: r.source,
          })),
        });
      })().finally(() => {
        this.detectionInFlight = null;
      });
    }
    await this.detectionInFlight;
  }

  // ---------------------------------------------------------------------------
  // Queries

  async snapshot(): Promise<Snapshot> {
    const doc = this.deps.store.current();
    const profiles = await Promise.all(doc.profiles.map((profile) => this.view(profile)));
    const { system } = this.deps;
    const environment: EnvironmentSummary = {
      platform: isSupportedPlatform(system.platform) ? system.platform : 'other',
      arch: system.arch,
      credentialOverrideVariables: presentVariables(
        system.env,
        CLAUDE_CREDENTIAL_OVERRIDE_VARS,
        system.platform,
      ),
      providerOverrideVariables: activeProviderVariables(system.env, system.platform),
      terminals: terminalIdsFor(system.platform),
    };
    return {
      appInfo: this.deps.appInfo,
      environment,
      profiles,
      apps: this.deps.registry.list().map((adapter) => this.appSummary(adapter)),
      settings: doc.settings,
      notices: this.notices,
      readOnly: this.deps.store.isReadOnly,
      lastLaunchedProfileId: doc.lastLaunchedProfileId,
      runtime: await this.runtime(),
    };
  }

  /** Live instances for every profile. Observes processes only; never signals them. */
  async runtime(): Promise<RuntimeSnapshot> {
    const ids = new Set(this.deps.store.current().profiles.map((p) => p.id));
    return this.deps.tracker.snapshot(ids);
  }

  settings(): Settings {
    return this.deps.store.current().settings;
  }

  private detection(appId: string): DetectionResult {
    return (
      this.detections.get(appId) ?? {
        status: 'not-found',
        executablePath: null,
        version: null,
        source: null,
        checkedAt: this.now().toISOString(),
      }
    );
  }

  private appSummary(adapter: AppAdapter): AppSummary {
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      kind: adapter.kind,
      platformSupported: (adapter.supportedPlatforms as readonly string[]).includes(
        this.deps.system.platform,
      ),
      storageKinds: [...adapter.storageKinds],
      defaultStorageKind: adapter.defaultStorageKind,
      isolationDocumented: adapter.isolationDocumented,
      mechanism: adapter.mechanism,
      supportsWorkingDirectory: adapter.supportsWorkingDirectory,
      supportsVerification: adapter.supportsVerification,
      supportsCopyCommand: adapter.supportsCopyCommand,
      copyCommandShells: adapter.shellsFor?.(this.deps.system.platform) ?? [],
      detection: this.detection(adapter.id),
    };
  }

  /** Resolves the configuration directory for a profile. Managed paths are re-checked for containment. */
  dataDirectory(profile: Profile): string | null {
    const p = pathApiFor(this.deps.system.platform);
    switch (profile.storage.kind) {
      case 'managed': {
        const dir = p.join(this.deps.paths.profilesRoot, profile.appId, profile.id);
        if (!isStrictlyInside(dir, this.deps.paths.profilesRoot, this.deps.system.platform)) {
          throw new AppFailure(
            'INTERNAL_ERROR',
            undefined,
            'managed path escaped the profiles root',
          );
        }
        return dir;
      }
      case 'custom':
        return profile.storage.path;
      case 'app-default':
        return null;
    }
  }

  private async fsState(profile: Profile, dataDirectory: string | null): Promise<ProfileFsState> {
    const { files } = this.deps.system;
    let dataState: ProfileFsState['dataDirectory'] = 'not-applicable';
    if (dataDirectory) {
      const stat = await files.stat(dataDirectory);
      dataState = !stat ? 'missing' : stat.isDirectory ? 'ok' : 'not-directory';
    }
    let workingState: ProfileFsState['workingDirectory'] = 'not-set';
    if (profile.launch.workingDirectory) {
      const stat = await files.stat(profile.launch.workingDirectory);
      workingState = stat?.isDirectory ? 'ok' : 'invalid';
    }
    return {
      dataDirectory: dataState,
      dataDirectoryRecreatable: profile.storage.kind === 'managed',
      workingDirectory: workingState,
    };
  }

  private async evaluate(
    profile: Profile,
  ): Promise<{ dataDirectory: string | null; report: CompatibilityReport }> {
    const adapter = this.deps.registry.get(profile.appId);
    const dataDirectory = this.dataDirectory(profile);
    if (!adapter) return { dataDirectory, report: unknownAppReport(profile.appId) };
    const fsState = await this.fsState(profile, dataDirectory);
    const report = adapter.evaluate({
      profile,
      dataDirectory,
      fsState,
      detection: this.detection(profile.appId),
      system: this.deps.system,
    });
    return { dataDirectory, report };
  }

  private async view(profile: Profile): Promise<ProfileView> {
    const { dataDirectory, report } = await this.evaluate(profile);
    return { ...profile, dataDirectory, compatibility: report };
  }

  private find(doc: MetadataDocument, id: string): Profile {
    const profile = doc.profiles.find((candidate) => candidate.id === id);
    if (!profile) throw new AppFailure('PROFILE_NOT_FOUND');
    return profile;
  }

  private requireAdapter(appId: string): AppAdapter {
    const adapter = this.deps.registry.get(appId);
    if (!adapter) throw new AppFailure('UNKNOWN_APPLICATION', { app: appId });
    return adapter;
  }

  private assertUniqueName(
    doc: MetadataDocument,
    appId: string,
    name: string,
    exceptId?: string,
  ): void {
    const key = nameKey(name);
    if (
      doc.profiles.some((p) => p.appId === appId && p.id !== exceptId && nameKey(p.name) === key)
    ) {
      throw new AppFailure('DUPLICATE_PROFILE_NAME', { name });
    }
  }

  private otherProfileDirectories(doc: MetadataDocument, exceptId?: string): string[] {
    return doc.profiles
      .filter((p) => p.id !== exceptId)
      .map((p) => this.dataDirectory(p))
      .filter((dir): dir is string => dir !== null);
  }

  private reservedDirectories(): string[] {
    return this.deps.registry
      .list()
      .flatMap((adapter) => adapter.reservedDirectories(this.deps.system));
  }

  // ---------------------------------------------------------------------------
  // Commands

  async create(input: CreateProfileRequest): Promise<string> {
    const { system, paths, logger } = this.deps;
    const adapter = this.requireAdapter(input.appId);
    if (!(adapter.supportedPlatforms as readonly string[]).includes(system.platform)) {
      throw new AppFailure('APP_UNSUPPORTED_PLATFORM', { app: adapter.displayName });
    }
    if (!(adapter.storageKinds as readonly string[]).includes(input.storage.kind)) {
      throw new AppFailure('STORAGE_KIND_NOT_SUPPORTED', { app: adapter.displayName });
    }

    let workingDirectory: string | null = null;
    if (input.launch.workingDirectory) {
      if (!adapter.supportsWorkingDirectory)
        throw new AppFailure('VALIDATION_FAILED', { field: 'workingDirectory' });
      workingDirectory = await validateWorkingDirectory(input.launch.workingDirectory, system);
    }

    let created: { leaf: string; first: string } | null = null;
    let newId = '';
    try {
      await this.deps.store.update(async (doc) => {
        this.assertUniqueName(doc, input.appId, input.name);
        if (
          input.storage.kind === 'app-default' &&
          doc.profiles.some((p) => p.appId === input.appId && p.storage.kind === 'app-default')
        ) {
          throw new AppFailure('APP_DEFAULT_ALREADY_USED', { app: adapter.displayName });
        }

        const ids = new Set(doc.profiles.map((p) => p.id));
        let storage: Profile['storage'];
        let id = generateProfileId(input.name, ids, this.deps.randomBytes);

        if (input.storage.kind === 'managed') {
          const p = pathApiFor(system.platform);
          // A leftover directory from a deleted profile is never reused, so a
          // new profile can never inherit someone else's sign-in.
          for (
            let attempt = 0;
            (await system.files.stat(p.join(paths.profilesRoot, input.appId, id))) !== null;
            attempt += 1
          ) {
            if (attempt > 8)
              throw new AppFailure(
                'DIRECTORY_CREATE_FAILED',
                undefined,
                'could not find unused managed directory',
              );
            ids.add(id);
            id = generateProfileId(input.name, ids, this.deps.randomBytes);
          }
          const dir = p.join(paths.profilesRoot, input.appId, id);
          const first = await createPrivateDirectory(dir);
          if (first) created = { leaf: dir, first };
          storage = { kind: 'managed' };
        } else if (input.storage.kind === 'custom') {
          const result = await validateCustomDirectory({
            rawPath: input.storage.path,
            allowNonEmpty: input.storage.allowNonEmpty,
            ownedRoots: ownedRoots(paths),
            reserved: this.reservedDirectories(),
            otherProfileDirectories: this.otherProfileDirectories(doc),
            system,
          });
          if (!result.exists) {
            const first = await createPrivateDirectory(result.path);
            if (first) created = { leaf: result.path, first };
          }
          storage = { kind: 'custom', path: result.path };
        } else {
          storage = { kind: 'app-default' };
        }

        const timestamp = this.now().toISOString();
        const profile: Profile = {
          id,
          appId: input.appId,
          name: input.name,
          description: input.description,
          color: input.color,
          storage,
          launch: {
            workingDirectory,
            inheritCredentialEnv: input.launch.inheritCredentialEnv ?? false,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
          lastLaunch: null,
        };
        newId = id;
        return { ...doc, profiles: [...doc.profiles, profile] };
      });
    } catch (error) {
      const toRollBack = created as { leaf: string; first: string } | null;
      if (toRollBack) await rollbackCreatedDirectories(toRollBack.leaf, toRollBack.first);
      throw error;
    }
    logger.info('profile.created', { id: newId, app: input.appId, storage: input.storage.kind });
    return newId;
  }

  async update(input: UpdateProfileRequest): Promise<void> {
    const { system } = this.deps;
    let workingDirectory: string | null | undefined;
    if (input.launch?.workingDirectory !== undefined) {
      workingDirectory =
        input.launch.workingDirectory === null
          ? null
          : await validateWorkingDirectory(input.launch.workingDirectory, system);
    }
    await this.deps.store.update((doc) => {
      const profile = this.find(doc, input.id);
      const adapter = this.deps.registry.get(profile.appId);
      if (workingDirectory && adapter && !adapter.supportsWorkingDirectory) {
        throw new AppFailure('VALIDATION_FAILED', { field: 'workingDirectory' });
      }
      if (input.name !== undefined)
        this.assertUniqueName(doc, profile.appId, input.name, profile.id);
      const updated: Profile = {
        ...profile,
        name: input.name ?? profile.name,
        description: input.description ?? profile.description,
        color: input.color ?? profile.color,
        launch: {
          workingDirectory:
            workingDirectory === undefined ? profile.launch.workingDirectory : workingDirectory,
          inheritCredentialEnv:
            input.launch?.inheritCredentialEnv ?? profile.launch.inheritCredentialEnv,
        },
        updatedAt: this.now().toISOString(),
      };
      return { ...doc, profiles: doc.profiles.map((p) => (p.id === profile.id ? updated : p)) };
    });
    this.deps.logger.info('profile.updated', { id: input.id });
  }

  /**
   * Removes a profile's metadata only. The profile's configuration directory
   * (which may hold the target application's sign-in and history) is left on
   * disk and its location is returned so the UI can tell the user.
   */
  async delete(id: string): Promise<string | null> {
    let retained: string | null = null;
    await this.deps.store.update((doc) => {
      const profile = this.find(doc, id);
      retained = this.dataDirectory(profile);
      return {
        ...doc,
        profiles: doc.profiles.filter((p) => p.id !== id),
        lastLaunchedProfileId: doc.lastLaunchedProfileId === id ? null : doc.lastLaunchedProfileId,
      };
    });
    this.deps.logger.info('profile.deleted', { id, directoryRetained: retained !== null });
    return retained;
  }

  async updateSettings(patch: SettingsPatch): Promise<void> {
    await this.deps.store.update((doc) => ({ ...doc, settings: { ...doc.settings, ...patch } }));
  }

  /** Resolves everything needed to act on a profile and refuses unavailable actions. */
  private async prepare(id: string) {
    const doc = this.deps.store.current();
    const profile = this.find(doc, id);
    const adapter = this.requireAdapter(profile.appId);
    const { dataDirectory, report } = await this.evaluate(profile);
    if (!report.launch.available) {
      throw new AppFailure('LAUNCH_NOT_AVAILABLE', { state: report.state });
    }
    if (profile.storage.kind === 'managed' && dataDirectory) {
      // The managed directory belongs to Profile Switcher; if the user removed
      // it, recreate it empty (equivalent to a fresh, signed-out profile).
      await createPrivateDirectory(dataDirectory);
    }
    return { profile, adapter, dataDirectory, detection: this.detection(profile.appId) };
  }

  private async recordLaunch(id: string, lastLaunch: LastLaunch): Promise<void> {
    if (this.deps.store.isReadOnly) return;
    try {
      await this.deps.store.update((doc) => ({
        ...doc,
        profiles: doc.profiles.map((p) => (p.id === id ? { ...p, lastLaunch } : p)),
        lastLaunchedProfileId: lastLaunch.outcome === 'started' ? id : doc.lastLaunchedProfileId,
      }));
    } catch (error) {
      // Failing to record history must not turn a successful launch into an error.
      this.deps.logger.warn('profile.record-launch-failed', { id, error });
    }
  }

  /**
   * Launches a new instance of the profile. Launching never stops, signals,
   * or reuses another profile's (or this profile's) running instances; each
   * launch is independent and gets its own launch ID and records.
   */
  async launch(id: string): Promise<LaunchReport> {
    const { profile, adapter, dataDirectory, detection } = await this.prepare(id);
    const plan = adapter.buildLaunchPlan({
      profile,
      dataDirectory,
      detection,
      system: this.deps.system,
    });
    const { tracker, system } = this.deps;
    const launchId = Buffer.from(this.deps.randomBytes(6)).toString('hex');
    const recordPid = plan.type === 'cli' && system.platform !== 'win32';
    if (recordPid) await tracker.ensureDirectory();
    try {
      const report = await this.deps.launcher.launch(plan, {
        profileId: profile.id,
        launchId,
        preferredTerminal: this.settings().preferredTerminal,
        pidFile: recordPid ? tracker.pidFileFor(profile.id, launchId) : null,
        onExit: () => tracker.markExited(launchId),
      });
      await tracker
        .register({
          launchId,
          profileId: profile.id,
          tracking: report.tracking,
          pid: report.pid,
          executable: plan.type === 'cli' ? plan.executable : plan.target,
          expectedEnv: plan.type === 'cli' ? { ...plan.env.set } : {},
        })
        .catch((error: unknown) => this.deps.logger.warn('runtime.register-failed', { error }));
      await this.recordLaunch(id, {
        at: this.now().toISOString(),
        outcome: 'started',
        method: report.method,
        isolation: report.isolation,
      });
      return report;
    } catch (error) {
      const code = error instanceof AppFailure ? error.appError.code : 'INTERNAL_ERROR';
      await this.recordLaunch(id, {
        at: this.now().toISOString(),
        outcome: 'failed',
        method: null,
        isolation: plan.isolation,
        errorCode: code,
      });
      throw error;
    }
  }

  async verify(id: string): Promise<VerificationReport> {
    const doc = this.deps.store.current();
    const adapter = this.requireAdapter(this.find(doc, id).appId);
    if (!adapter.supportsVerification || !adapter.verify)
      throw new AppFailure('VERIFICATION_NOT_SUPPORTED');
    const { profile, dataDirectory, detection } = await this.prepare(id);
    const report = await adapter.verify({
      profile,
      dataDirectory,
      detection,
      system: this.deps.system,
    });
    // Log the outcome only; account details are never logged or persisted.
    this.deps.logger.info('profile.verified', {
      id,
      matches: report.configDirectoryMatches,
      loggedIn: report.loggedIn,
      version: report.appVersion,
    });
    return report;
  }

  async copyCommand(id: string, shell: CommandShell): Promise<string> {
    const doc = this.deps.store.current();
    const adapter = this.requireAdapter(this.find(doc, id).appId);
    if (
      !adapter.supportsCopyCommand ||
      !(adapter.shellsFor?.(this.deps.system.platform) ?? []).includes(shell)
    ) {
      throw new AppFailure('VALIDATION_FAILED', { field: 'shell' });
    }
    const { profile, dataDirectory, detection } = await this.prepare(id);
    const plan = adapter.buildLaunchPlan({
      profile,
      dataDirectory,
      detection,
      system: this.deps.system,
    });
    if (plan.type !== 'cli') throw new AppFailure('VALIDATION_FAILED', { field: 'shell' });
    try {
      return buildCopyCommand(plan, shell, profile.launch.workingDirectory !== null);
    } catch (error) {
      if (error instanceof UnsafeValueError)
        throw new AppFailure('EXECUTABLE_INVALID', undefined, error.message);
      throw error;
    }
  }

  /** Directory to reveal in the OS file manager. Never a path supplied by the renderer. */
  async directoryToOpen(id: string): Promise<string> {
    const profile = this.find(this.deps.store.current(), id);
    const dir = this.dataDirectory(profile);
    if (!dir) throw new AppFailure('OPEN_FOLDER_FAILED', { reason: 'app-default' });
    const stat = await this.deps.system.files.stat(dir);
    if (!stat?.isDirectory) throw new AppFailure('DIRECTORY_MISSING');
    return dir;
  }

  currentDetections(): ReadonlyMap<string, DetectionResult> {
    return this.detections;
  }
}
