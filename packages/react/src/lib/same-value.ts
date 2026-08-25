/**
 * Deep equality over a Plate `Value`, which is plain JSON: objects, arrays, strings, numbers,
 * booleans and null. Behind the short circuit in docs/04 section 3.2 - a page the reader only
 * clicked through must produce zero writes - so it runs while the session is clean and never
 * again once a real edit has landed.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => key in right && sameValue(left[key], right[key]))
  );
}
