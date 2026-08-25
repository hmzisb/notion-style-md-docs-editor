import { fnv1a64 } from './hash.js';

/**
 * Identity rules from docs/03 section 4.2. Ids are opaque: nothing downstream may
 * parse one. The prefixes exist so a provider can tell a written id from a derived
 * one, not so the UI can branch on them.
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_SET = new Set(CROCKFORD);

/** `noUncheckedIndexedAccess` cannot see that every caller masks to 0..31. */
function digit(value: number): string {
  return CROCKFORD.charAt(value);
}
const TIME_LEN = 10;
const RANDOM_LEN = 16;
export const ID_LENGTH = TIME_LEN + RANDOM_LEN;

/** Path-derived id for a page in a read-only store, or before the first write. */
export function pathHashId(path: string): string {
  return `h_${fnv1a64(path)}`;
}

/** Folder id. Folder → page conversion carries this same id into the new `index.md`. */
export function folderHashId(dirPath: string): string {
  return `f_${fnv1a64(dirPath)}`;
}

export function isDerivedId(id: string): boolean {
  return id.startsWith('h_') || id.startsWith('f_');
}

function encodeTime(time: number): string {
  let out = '';
  let rest = time;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = digit(rest % 32) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** State for the monotonic guarantee: same millisecond → increment, never re-roll. */
let lastTime = -1;
let lastRandom: number[] = [];

function freshRandom(): number[] {
  return Array.from(randomBytes(RANDOM_LEN), (b) => b % 32);
}

/** Increment the base-32 random field in place; returns false on the (astronomically rare) overflow. */
function incrementRandom(digits: number[]): boolean {
  for (let i = digits.length - 1; i >= 0; i--) {
    const next = (digits[i] ?? 0) + 1;
    if (next < 32) {
      digits[i] = next;
      return true;
    }
    digits[i] = 0;
  }
  return false;
}

/**
 * ULID-style: 10 chars of millisecond timestamp + 16 chars of randomness, Crockford
 * base32, 26 chars total. Lexicographic order matches creation order, which keeps
 * `order`-less siblings stable, and ids issued in the same millisecond stay distinct
 * and increasing.
 */
export function generateId(now: number = Date.now()): string {
  if (now === lastTime) {
    if (!incrementRandom(lastRandom)) {
      // Overflowed 80 bits inside one millisecond: step the clock instead of repeating.
      lastTime = now + 1;
      lastRandom = freshRandom();
    }
  } else {
    lastTime = now;
    lastRandom = freshRandom();
  }
  let random = '';
  for (const value of lastRandom) random += digit(value);
  return encodeTime(lastTime) + random;
}

/** Shape check only: an id is opaque, this is for fixtures and the doctor. */
export function isGeneratedId(id: string): boolean {
  if (id.length !== ID_LENGTH) return false;
  for (const char of id) {
    if (!CROCKFORD_SET.has(char)) return false;
  }
  return true;
}
