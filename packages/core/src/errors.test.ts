import { describe, expect, it } from 'vitest';
import { ConflictError, ProviderError, StorageQuotaError, isConflictError } from './errors.js';

describe('errors', () => {
  it('keeps instanceof across subclasses', () => {
    const e = new ConflictError('sha256:abc');
    expect(e).toBeInstanceOf(ConflictError);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e).toBeInstanceOf(Error);
    expect(isConflictError(e)).toBe(true);
  });

  it('exposes the current version on a conflict', () => {
    expect(new ConflictError('sha256:abc').currentVersion).toBe('sha256:abc');
    expect(new ConflictError('sha256:abc').code).toBe('conflict');
  });

  it('leaves details undefined when none were given', () => {
    expect(new ProviderError('not_found', 'gone').details).toBeUndefined();
    expect(new ProviderError('validation', 'bad', { field: 'title' }).details).toEqual({
      field: 'title',
    });
  });

  it('codes a quota error as quota', () => {
    expect(new StorageQuotaError().code).toBe('quota');
  });
});
