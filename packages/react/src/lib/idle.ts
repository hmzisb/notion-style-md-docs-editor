/**
 * `requestIdleCallback` where it exists; a macrotask everywhere else (Safari before 17.4 and
 * jsdom have neither global). Used for work that must not compete with typing: warming the
 * editor chunk (docs/05 section 8) and serializing a draft (docs/04 section 3.1).
 */
export function requestIdle(run: () => void, timeoutMs = 200): number {
  if (typeof requestIdleCallback === 'function')
    return requestIdleCallback(run, { timeout: timeoutMs });
  return window.setTimeout(run, timeoutMs);
}

export function cancelIdle(handle: number): void {
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle);
  else clearTimeout(handle);
}
