/**
 * Error codes returned across the IPC boundary. Each code maps to a
 * "what failed / likely reason / what to do next" triple in the renderer's
 * locale catalog. `detail` carries sanitized diagnostic text for the
 * diagnostics view and logs; it is never shown as the primary message.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'PROFILE_NOT_FOUND',
  'DUPLICATE_PROFILE_NAME',
  'UNKNOWN_APPLICATION',
  'STORAGE_KIND_NOT_SUPPORTED',
  'APP_DEFAULT_ALREADY_USED',
  'DIRECTORY_NOT_ABSOLUTE',
  'DIRECTORY_IS_FILE',
  'DIRECTORY_NOT_EMPTY',
  'DIRECTORY_RESERVED',
  'DIRECTORY_OVERLAPS_PROFILE',
  'DIRECTORY_CREATE_FAILED',
  'DIRECTORY_NOT_WRITABLE',
  'DIRECTORY_MISSING',
  'WORKING_DIRECTORY_INVALID',
  'METADATA_READ_FAILED',
  'METADATA_WRITE_FAILED',
  'METADATA_READ_ONLY',
  'APP_NOT_FOUND',
  'APP_UNSUPPORTED_PLATFORM',
  'EXECUTABLE_INVALID',
  'LAUNCH_NOT_AVAILABLE',
  'LAUNCH_FAILED',
  'TERMINAL_NOT_FOUND',
  'SWITCH_CLOSE_FAILED',
  'VERIFICATION_NOT_SUPPORTED',
  'VERIFICATION_FAILED',
  'OPEN_FOLDER_FAILED',
  'LINK_NOT_ALLOWED',
  'FORBIDDEN_SENDER',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppError {
  code: ErrorCode;
  params?: Record<string, string | number>;
  /** Sanitized diagnostic detail. Must never contain secrets. */
  detail?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(
  code: ErrorCode,
  params?: Record<string, string | number>,
  detail?: string,
): Result<T> {
  const error: AppError = { code };
  if (params) error.params = params;
  if (detail) error.detail = detail;
  return { ok: false, error };
}

/** Thrown inside the main process and converted to a Result at the IPC boundary. */
export class AppFailure extends Error {
  readonly appError: AppError;

  constructor(code: ErrorCode, params?: Record<string, string | number>, detail?: string) {
    super(detail ?? code);
    this.name = 'AppFailure';
    this.appError = { code };
    if (params) this.appError.params = params;
    if (detail) this.appError.detail = detail;
  }
}

export function isAppFailure(value: unknown): value is AppFailure {
  return value instanceof AppFailure;
}
