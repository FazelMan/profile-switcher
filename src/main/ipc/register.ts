import { isAppFailure, type AppError, type Result } from '@shared/domain/errors';
import type { IpcChannel } from '@shared/ipc';
import type { Logger } from '../diagnostics/logger';
import { IPC_ARG_SCHEMAS, type IpcArgs } from './schemas';

/** Minimal shape of the Electron IPC event the security checks need. */
export interface IpcEventLike {
  sender: { id: number };
  /** `parent` is null only for a top-level frame. */
  senderFrame: { url: string; parent: unknown } | null;
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcEventLike, ...args: unknown[]) => Promise<unknown>,
  ): void;
}

export type IpcHandlers = {
  [C in IpcChannel]: (...args: IpcArgs<C>) => Promise<unknown>;
};

export interface RegisterOptions {
  ipcMain: IpcMainLike;
  handlers: IpcHandlers;
  isTrustedSender: (event: IpcEventLike) => boolean;
  logger: Logger;
}

function failure(error: AppError): Result<never> {
  return { ok: false, error };
}

/**
 * Registers every channel with the same guard sequence:
 *  1. reject senders other than the app's own top-level renderer frame,
 *  2. validate the argument list against the channel's schema,
 *  3. run the handler and convert thrown AppFailures into Result errors.
 * Unexpected exceptions are logged and reported as INTERNAL_ERROR without
 * leaking stack traces to the renderer.
 */
export function registerIpcHandlers({
  ipcMain,
  handlers,
  isTrustedSender,
  logger,
}: RegisterOptions): void {
  for (const channel of Object.keys(IPC_ARG_SCHEMAS) as IpcChannel[]) {
    const schema = IPC_ARG_SCHEMAS[channel];
    const handler = handlers[channel] as (...args: unknown[]) => Promise<unknown>;
    ipcMain.handle(channel, async (event, ...rawArgs) => {
      if (!isTrustedSender(event)) {
        logger.warn('ipc.rejected-sender', { channel });
        return failure({ code: 'FORBIDDEN_SENDER' });
      }
      const parsed = schema.safeParse(rawArgs);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field =
          issue?.path.filter((segment) => typeof segment !== 'number' || segment > 0).join('.') ??
          '';
        logger.warn('ipc.invalid-arguments', { channel, field });
        return failure({
          code: 'VALIDATION_FAILED',
          params: { field: field || 'input', issue: issue?.message ?? 'invalid' },
        });
      }
      try {
        const value = await handler(...(parsed.data as unknown[]));
        return { ok: true, value };
      } catch (error) {
        if (isAppFailure(error)) {
          logger.warn('ipc.failed', {
            channel,
            code: error.appError.code,
            detail: error.appError.detail,
          });
          return failure(error.appError);
        }
        logger.error('ipc.unexpected-error', { channel, error });
        return failure({ code: 'INTERNAL_ERROR' });
      }
    });
  }
}

/**
 * Builds the sender check for the main window. Only the window's own
 * top-level frame, showing the app's own page, may call privileged handlers.
 */
export function createSenderValidator(options: {
  getWebContentsId: () => number | null;
  isAllowedUrl: (url: string) => boolean;
}): (event: IpcEventLike) => boolean {
  return (event) => {
    const expectedId = options.getWebContentsId();
    if (expectedId === null || event.sender.id !== expectedId) return false;
    const frame = event.senderFrame;
    if (!frame || frame.parent !== null) return false;
    return options.isAllowedUrl(frame.url);
  };
}
