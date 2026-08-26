/**
 * docs/07 section 10 asks for one toaster, and docs/02 section 7 asks for a shell that does not
 * carry `sonner` in its entry: nothing has toasted yet when a page is painted, and most sessions
 * never toast at all. Callers get this function; the library, the toaster and their chunk arrive
 * on the first message (DEV-012).
 */
type Sink = (message: string) => void;

const queued: string[] = [];
let sink: Sink | null = null;
let wake: (() => void) | null = null;

/** Shows a message, loading the toaster first if this is the first one. */
export function toast(message: string): void {
  if (sink !== null) {
    sink(message);
    return;
  }
  queued.push(message);
  wake?.();
}

/** The shell's gate: it mounts the toaster when the first message is waiting for one. */
export function onToastQueued(listener: () => void): () => void {
  wake = listener;
  return () => {
    if (wake === listener) wake = null;
  };
}

/** A message queued before the gate mounted, which is a message it has to mount for. */
export const toastsWaiting = (): boolean => queued.length > 0;

/** The toaster went with the shell that mounted it, so messages wait for the next one. */
export function releaseToasts(): void {
  sink = null;
}

/** The toaster, once its chunk is in: it takes what is waiting and everything after it. */
export function drainToasts(next: Sink): void {
  sink = next;
  for (const message of queued.splice(0)) next(message);
}
