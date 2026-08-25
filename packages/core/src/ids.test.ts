import { describe, expect, it } from 'vitest';
import {
  ID_LENGTH,
  folderHashId,
  generateId,
  isDerivedId,
  isGeneratedId,
  pathHashId,
} from './ids.js';

describe('derived ids', () => {
  it('matches the documented prefix and hash', () => {
    expect(pathHashId('guides/auth.md')).toBe('h_f17a8dcbc6f04aba');
    expect(folderHashId('guides/auth')).toBe('f_57f920a10b77b52f');
  });

  it('is stable and path-sensitive', () => {
    expect(pathHashId('a/b.md')).toBe(pathHashId('a/b.md'));
    expect(pathHashId('a/b.md')).not.toBe(pathHashId('a/c.md'));
    expect(pathHashId('guides/auth')).not.toBe(folderHashId('guides/auth'));
  });

  it('recognises derived ids', () => {
    expect(isDerivedId(pathHashId('a.md'))).toBe(true);
    expect(isDerivedId(folderHashId('a'))).toBe(true);
    expect(isDerivedId(generateId())).toBe(false);
  });
});

describe('generateId', () => {
  it('is 26 Crockford base32 characters', () => {
    const id = generateId();
    expect(id).toHaveLength(ID_LENGTH);
    expect(id).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
    expect(isGeneratedId(id)).toBe(true);
  });

  it('produces 10k unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) ids.add(generateId());
    expect(ids.size).toBe(10_000);
  });

  it('is monotonic within a millisecond', () => {
    const frozen = 1_767_225_600_000;
    const ids = Array.from({ length: 1000 }, () => generateId(frozen));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(1000);
  });

  it('sorts by creation time across milliseconds', () => {
    const a = generateId(1_767_225_600_000);
    const b = generateId(1_767_225_600_001);
    expect(a < b).toBe(true);
    expect(a.slice(0, 10)).not.toBe(b.slice(0, 10));
  });

  it('encodes the timestamp in the first 10 characters', () => {
    expect(generateId(0).slice(0, 10)).toBe('0000000000');
    expect(generateId(32).slice(0, 10)).toBe('0000000010');
  });
});
