import { beforeEach, describe, expect, it, vi } from 'vitest';

const pickDirectory = vi.fn();
const createFileSystemProvider = vi.fn(() => ({ key: 'stub' }));

vi.mock('@hmzisb/notion-docs-react/adapters/filesystem', () => ({
  pickDirectory,
  createFileSystemProvider,
  getOpfsRoot: vi.fn(),
  exportToDirectory: vi.fn(),
  importFromDirectory: vi.fn(),
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string): string | null => store.get(key) ?? null,
  setItem: (key: string, value: string): void => void store.set(key, value),
  removeItem: (key: string): void => void store.delete(key),
  clear: (): void => {
    store.clear();
  },
});

const { openFolder, readSettings, writeSettings } = await import('./providers.js');

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('workspace settings', () => {
  it('starts with no mode, so a first visit lands on the picker', () => {
    expect(readSettings()).toEqual({ mode: null, baseUrl: '', folder: null, opfsEpoch: 0 });
  });

  it('round-trips a choice', () => {
    writeSettings({ mode: 'remote', baseUrl: 'https://x/api', folder: null, opfsEpoch: 2 });
    expect(readSettings()).toEqual({
      mode: 'remote',
      baseUrl: 'https://x/api',
      folder: null,
      opfsEpoch: 2,
    });
  });

  it('ignores a record another version wrote, rather than crashing on it', () => {
    store.set('playground:workspace', '{"mode":"telepathy","folder":{"slot":"one"}}');
    expect(readSettings()).toEqual({ mode: null, baseUrl: '', folder: null, opfsEpoch: 0 });

    store.set('playground:workspace', 'not json');
    expect(readSettings().mode).toBeNull();
  });
});

describe('openFolder', () => {
  const handle = (name: string): FileSystemDirectoryHandle =>
    ({ name }) as FileSystemDirectoryHandle;

  it('reuses the slot it saved, so a reopen keeps the cache namespace', async () => {
    pickDirectory.mockResolvedValue(handle('notes'));
    const settings = {
      mode: 'folder' as const,
      baseUrl: '',
      folder: { slot: 3, name: 'notes' },
      opfsEpoch: 0,
    };

    const opened = await openFolder(settings, false);

    expect(pickDirectory).toHaveBeenCalledWith({ mode: 'readwrite', id: 'playground-3' });
    expect(opened?.settings.folder).toEqual({ slot: 3, name: 'notes' });
    expect(createFileSystemProvider).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ key: 'fs:3:notes' }),
    );
  });

  it('takes the next slot for a new folder, so two folders never share one namespace', async () => {
    pickDirectory.mockResolvedValue(handle('notes'));
    const settings = {
      mode: 'folder' as const,
      baseUrl: '',
      folder: { slot: 3, name: 'notes' },
      opfsEpoch: 0,
    };

    const opened = await openFolder(settings, true);

    expect(pickDirectory).toHaveBeenCalledWith({ mode: 'readwrite', id: 'playground-4' });
    // The same folder name, a different key: the old workspace's pages cannot be painted.
    expect(createFileSystemProvider).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ key: 'fs:4:notes' }),
    );
    expect(opened?.settings.folder).toEqual({ slot: 4, name: 'notes' });
  });

  it('gives back nothing when the user cancels or the browser has no picker', async () => {
    pickDirectory.mockResolvedValue(null);
    expect(await openFolder(readSettings(), false)).toBeNull();
  });
});
