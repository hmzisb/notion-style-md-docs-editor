import type { DocsEvent } from '@docs/react';

/**
 * docs/08 section 3: `onEvent` is the host's window into the module. This host keeps the last
 * of them on `window`, which is where `e2e/perf.spec.ts` reads the save timings of docs/10
 * section 5 out of - the numbers exist nowhere else, because a save is a debounce and a write
 * the driver cannot see between.
 */
const LIMIT = 500;

declare global {
  interface Window {
    /** Newest last. Present from the first render of a workspace. */
    __docsEvents?: DocsEvent[];
  }
}

const log: DocsEvent[] = [];
window.__docsEvents = log;

export function recordEvent(event: DocsEvent): void {
  log.push(event);
  // A long session saves hundreds of times; only the tail is ever looked at.
  if (log.length > LIMIT) log.splice(0, log.length - LIMIT);
}
