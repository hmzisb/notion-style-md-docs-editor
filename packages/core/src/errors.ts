/**
 * Every provider failure crosses the seam as a `ProviderError`. Raw `Error`s never do:
 * the UI switches on `code` to pick a banner, a retry policy and a string.
 */
export type ProviderErrorCode =
  | 'not_found'
  | 'conflict'
  | 'forbidden'
  | 'validation'
  | 'unsupported'
  | 'network'
  | 'quota'
  | 'internal';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly details?: unknown;

  constructor(code: ProviderErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.details = details;
    // Native subclassing of Error is only correct with an explicit prototype fix
    // when the file is downlevelled; tsup targets es2022 but consumers may not.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConflictError extends ProviderError {
  readonly currentVersion: string;

  constructor(currentVersion: string, message = 'The page changed since it was opened.') {
    super('conflict', message, { currentVersion });
    this.name = 'ConflictError';
    this.currentVersion = currentVersion;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StorageQuotaError extends ProviderError {
  constructor(message = 'Browser storage is full.', details?: unknown) {
    super('quota', message, details);
    this.name = 'StorageQuotaError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError;
}

export function isConflictError(value: unknown): value is ConflictError {
  return value instanceof ConflictError;
}
