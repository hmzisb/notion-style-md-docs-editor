import { describe, expect, it } from 'vitest';
import { fnv1a64, pageVersion, sha256Hex } from './hash.js';

describe('sha256Hex', () => {
  it('matches published vectors', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes bytes and the equivalent string identically', async () => {
    const bytes = new TextEncoder().encode('# Title\n');
    expect(await sha256Hex(bytes)).toBe(await sha256Hex('# Title\n'));
  });

  it('is byte-sensitive, so CRLF and LF are different versions', async () => {
    expect(await sha256Hex('a\r\nb')).not.toBe(await sha256Hex('a\nb'));
  });

  it('prefixes the page version', async () => {
    expect(await pageVersion('abc')).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('fnv1a64', () => {
  it('matches known FNV-1a 64-bit vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('always returns 16 hex characters', () => {
    for (const s of ['', 'a', 'guides/auth/index.md', '🧠 unicode', 'x'.repeat(500)]) {
      expect(fnv1a64(s)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('separates paths that differ only in a separator', () => {
    expect(fnv1a64('a/b')).not.toBe(fnv1a64('a-b'));
  });
});
