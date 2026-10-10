import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AppFailure } from '@shared/domain/errors';
import { msg, type Message } from '@shared/domain/messages';
import type { Logger } from '../diagnostics/logger';
import { errorCode, writeFileAtomic } from './atomic-write';
import {
  createDefaultDocument,
  metadataDocumentSchema,
  migrateDocument,
  type MetadataDocument,
  type MigrationOutcome,
} from './schema';

export interface LoadOutcome {
  document: MetadataDocument;
  notices: Message[];
  readOnly: boolean;
}

export interface MetadataStoreOptions {
  filePath: string;
  logger: Logger;
  /** Migration step; defaults to the real migration table. Injectable for tests. */
  migrate?: (raw: unknown) => MigrationOutcome;
  now?: () => Date;
}

type ReadResult =
  | { kind: 'missing' }
  | { kind: 'valid'; document: MetadataDocument; migratedFrom: number | null }
  | { kind: 'newer'; version: number; lenient: MetadataDocument | null }
  | { kind: 'corrupt'; reason: string };

/**
 * Versioned JSON metadata with atomic writes, a last-known-good backup,
 * corruption quarantine, and forward-only migrations.
 *
 * All mutations go through `update`, which serializes callers so concurrent
 * IPC requests cannot interleave read-modify-write cycles.
 */
export class MetadataStore {
  private readonly filePath: string;
  private readonly backupPath: string;
  private readonly logger: Logger;
  private readonly migrate: (raw: unknown) => MigrationOutcome;
  private readonly now: () => Date;
  private document: MetadataDocument | null = null;
  private readOnly = false;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(options: MetadataStoreOptions) {
    this.filePath = options.filePath;
    this.backupPath = `${options.filePath}.bak`;
    this.logger = options.logger;
    this.migrate = options.migrate ?? ((raw) => migrateDocument(raw));
    this.now = options.now ?? (() => new Date());
  }

  get path(): string {
    return this.filePath;
  }

  get isReadOnly(): boolean {
    return this.readOnly;
  }

  current(): MetadataDocument {
    if (!this.document) throw new Error('MetadataStore.load() has not been called');
    return this.document;
  }

  async load(): Promise<LoadOutcome> {
    return this.withLock(() => this.loadUnlocked());
  }

  /**
   * Applies `mutator` to a copy of the current document, validates the
   * result, and persists it atomically. The mutator may throw an AppFailure
   * to abort without writing.
   */
  async update(
    mutator: (draft: MetadataDocument) => Promise<MetadataDocument> | MetadataDocument,
  ): Promise<MetadataDocument> {
    return this.withLock(async () => {
      if (this.readOnly) throw new AppFailure('METADATA_READ_ONLY');
      const draft = structuredClone(this.current());
      const next = await mutator(draft);
      const parsed = metadataDocumentSchema.safeParse(next);
      if (!parsed.success) {
        // A failure here is a programming error: inputs are validated before
        // reaching the store. Refuse to persist rather than write bad data.
        this.logger.error('metadata.invalid-update', {
          issues: parsed.error.issues.map((i) => i.message),
        });
        throw new AppFailure('INTERNAL_ERROR', undefined, 'Refused to persist invalid metadata');
      }
      await this.persist(parsed.data);
      this.document = parsed.data;
      return parsed.data;
    });
  }

  private async withLock<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lock.then(task, task);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async loadUnlocked(): Promise<LoadOutcome> {
    const notices: Message[] = [];
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });

    const primary = await this.readDocument(this.filePath);

    if (primary.kind === 'valid') {
      this.document = primary.document;
      this.readOnly = false;
      if (primary.migratedFrom !== null) {
        // Keep the pre-migration file so a downgrade can be undone by hand.
        await fs
          .copyFile(this.filePath, `${this.filePath}.v${primary.migratedFrom}.bak`)
          .catch(() => undefined);
        await this.persist(primary.document);
        this.logger.info('metadata.migrated', { from: primary.migratedFrom });
      }
      return { document: primary.document, notices, readOnly: false };
    }

    if (primary.kind === 'newer') {
      // Written by a newer Profile Switcher. Never overwrite it: show what we
      // can and refuse all writes until the user upgrades.
      this.readOnly = true;
      this.document = primary.lenient ?? createDefaultDocument();
      notices.push(msg('notice.metadataNewerSchema', { version: primary.version }));
      this.logger.warn('metadata.newer-schema', { version: primary.version });
      return { document: this.document, notices, readOnly: true };
    }

    if (primary.kind === 'corrupt') {
      const quarantined = await this.quarantine();
      this.logger.error('metadata.corrupt', { reason: primary.reason, quarantined });
    }

    const backup = await this.readDocument(this.backupPath);
    if (backup.kind === 'valid') {
      this.document = backup.document;
      this.readOnly = false;
      await this.persist(backup.document, { skipBackup: true });
      notices.push(msg('notice.metadataRecoveredFromBackup'));
      this.logger.warn('metadata.restored-from-backup', { primaryState: primary.kind });
      return { document: backup.document, notices, readOnly: false };
    }

    const fresh = createDefaultDocument();
    this.document = fresh;
    this.readOnly = false;
    await this.persist(fresh, { skipBackup: true });
    if (primary.kind === 'corrupt') {
      notices.push(msg('notice.metadataReset'));
    }
    this.logger.info('metadata.initialized', { primaryState: primary.kind });
    return { document: fresh, notices, readOnly: false };
  }

  private async readDocument(filePath: string): Promise<ReadResult> {
    let text: string;
    try {
      text = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { kind: 'missing' };
      throw new AppFailure(
        'METADATA_READ_FAILED',
        undefined,
        `read failed: ${errorCode(error) ?? 'unknown'}`,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { kind: 'corrupt', reason: 'invalid JSON' };
    }

    const migrated = this.migrate(raw);
    if (migrated.kind === 'invalid') return { kind: 'corrupt', reason: migrated.reason };
    if (migrated.kind === 'newer') {
      return { kind: 'newer', version: migrated.version, lenient: this.lenientParse(raw) };
    }

    const parsed = metadataDocumentSchema.safeParse(migrated.document);
    if (!parsed.success) {
      return { kind: 'corrupt', reason: `schema: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
    }
    return {
      kind: 'valid',
      document: parsed.data,
      migratedFrom: migrated.kind === 'migrated' ? migrated.fromVersion : null,
    };
  }

  /** Best-effort read of a newer document for display only. */
  private lenientParse(raw: unknown): MetadataDocument | null {
    const candidate = { ...(raw as Record<string, unknown>), schemaVersion: 1 };
    const loose = metadataDocumentSchema.safeParse(candidate);
    return loose.success ? loose.data : null;
  }

  private async quarantine(): Promise<string | null> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const target = path.join(path.dirname(this.filePath), `metadata.corrupt-${stamp}.json`);
    try {
      await fs.rename(this.filePath, target);
      return path.basename(target);
    } catch {
      return null;
    }
  }

  private async persist(
    document: MetadataDocument,
    options: { skipBackup?: boolean } = {},
  ): Promise<void> {
    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    try {
      if (!options.skipBackup) {
        // Back up the last known-good file before replacing it. The current
        // file is valid by construction: it was either loaded and validated
        // or written by this process.
        const existing = await fs.readFile(this.filePath, 'utf8').catch(() => null);
        if (existing !== null) await writeFileAtomic(this.backupPath, existing);
      }
      await writeFileAtomic(this.filePath, serialized);
    } catch (error) {
      this.logger.error('metadata.write-failed', { code: errorCode(error) ?? 'unknown' });
      throw new AppFailure(
        'METADATA_WRITE_FAILED',
        undefined,
        `write failed: ${errorCode(error) ?? 'unknown'}`,
      );
    }
  }
}
