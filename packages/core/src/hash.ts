/**
 * Two hashes with two jobs (docs/03 section 4.9):
 * - `sha256Hex` is the page version, computed over the full file bytes.
 * - `fnv1a64` is the cheap structural hash: tree snapshot versions and path-derived ids.
 */

const SUBTLE: SubtleCrypto | undefined =
  typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.subtle : undefined;

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = '';
  for (const byte of view) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * Web Crypto is available in browsers and Node 20+. There is no JS fallback on
 * purpose: a silent non-SHA-256 fallback would produce versions that do not match
 * across environments, which is worse than a clear failure.
 */
export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  if (!SUBTLE) {
    throw new Error(
      'Web Crypto is unavailable; @hmzisb/notion-docs-core needs crypto.subtle for page versions.',
    );
  }
  const data =
    typeof input === 'string'
      ? encoder.encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  // A fresh copy keeps the buffer type unambiguous for SubtleCrypto across runtimes.
  const digest = await SUBTLE.digest('SHA-256', data.slice().buffer);
  return toHex(digest);
}

/** `sha256:<hex>` — the string shape used everywhere a page version travels. */
export async function pageVersion(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  return `sha256:${await sha256Hex(input)}`;
}

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a, 64-bit, over the UTF-8 bytes. Returns 16 lowercase hex chars. */
export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET_64;
  const bytes = encoder.encode(input);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}
