import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDirectory } from './filesystem-fake.js';
import { pickDirectory } from './filesystem.js';

/**
 * A `FileSystemHandle` is structured-cloneable in a browser and not in `fake-indexeddb`, and
 * the permission API is a pair of methods, which nothing can clone. So the store behind
 * `pickDirectory` is a plain map here: what matters is which key it reads, what it writes back
 * and when the picker is opened at all.
 */
const saved = vi.hoisted(() => new Map<string, unknown>());

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: (key: string) => Promise.resolve(saved.get(key)),
  set: (key: string, value: unknown) => {
    saved.set(key, value);
    return Promise.resolve();
  },
}));

const KEY = 'docs:handle:workspace';

/** A stored handle plus the permission state the browser would answer for it. */
function storedHandle(state: PermissionState, granted: PermissionState = state): void {
  const handle = createFakeDirectory({ 'index.md': '# Saved\n' });
  Object.assign(handle, {
    queryPermission: () => Promise.resolve(state),
    requestPermission: () => Promise.resolve(granted),
  });
  saved.set(KEY, handle);
}

function withPicker(picker: unknown): void {
  Object.defineProperty(globalThis, 'showDirectoryPicker', { configurable: true, value: picker });
}

beforeEach(() => {
  saved.clear();
  Reflect.deleteProperty(globalThis, 'showDirectoryPicker');
});

describe('pickDirectory (docs/08 section 7)', () => {
  it('reuses the folder from last time without opening the picker', async () => {
    storedHandle('granted');
    const picker = vi.fn();
    withPicker(picker);

    await expect(pickDirectory({ id: 'workspace' })).resolves.toBe(saved.get(KEY));
    expect(picker).not.toHaveBeenCalled();
  });

  it('re-requests permission on the gesture, and reuses the folder once it is granted', async () => {
    storedHandle('prompt', 'granted');
    const picker = vi.fn();
    withPicker(picker);

    await expect(pickDirectory({ id: 'workspace' })).resolves.toBe(saved.get(KEY));
    expect(picker).not.toHaveBeenCalled();
  });

  it('falls back to the picker when the stored folder is refused, and stores the new one', async () => {
    storedHandle('prompt', 'denied');
    const picked = createFakeDirectory();
    const picker = vi.fn(() => Promise.resolve(picked));
    withPicker(picker);

    await expect(pickDirectory({ id: 'workspace' })).resolves.toBe(picked);
    expect(picker).toHaveBeenCalledWith({ mode: 'readwrite', id: 'workspace' });
    expect(saved.get(KEY)).toBe(picked);
  });

  it('asks for read access when that is all the host wants', async () => {
    const picker = vi.fn(() => Promise.resolve(createFakeDirectory()));
    withPicker(picker);

    await pickDirectory({ mode: 'read' });
    expect(picker).toHaveBeenCalledWith({ mode: 'read' });
    expect(saved.size).toBe(0);
  });

  it('returns null when the user cancels the picker', async () => {
    withPicker(() => Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })));
    await expect(pickDirectory()).resolves.toBeNull();
  });

  it('returns null where the engine has no picker, so the host can hide the button', async () => {
    await expect(pickDirectory({ id: 'workspace' })).resolves.toBeNull();
  });
});
