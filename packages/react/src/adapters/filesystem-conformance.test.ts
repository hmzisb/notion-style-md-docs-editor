import { loadCorpus, runProviderConformance } from '@docs/core/testing';
import type { DocumentProvider } from '@docs/core';
import { createFakeDirectory } from './filesystem-fake.js';
import { createFileSystemProvider } from './filesystem.js';

/**
 * docs/03 section 10: the filesystem adapter answers the same contract the memory provider
 * does. The corpus is the shared seed, and the fake directory handle is the only difference
 * between this run and the one in core.
 */
// jsdom transforms this file for the browser, where `import.meta.url` is an http URL and the
// loader's own default root cannot be resolved. Vitest runs it from the package directory.
const corpus = await loadCorpus();
const seed: Record<string, string | Uint8Array> = {
  ...Object.fromEntries(corpus.manifest.pages.map((page) => [page.path, corpus.read(page.path)])),
  ...Object.fromEntries(corpus.assets),
};

const provider = (readOnly: boolean, move: boolean) => (): Promise<DocumentProvider> =>
  Promise.resolve(
    createFileSystemProvider(createFakeDirectory(seed, { move }), {
      key: 'fs:corpus',
      title: 'Corpus',
      readOnly,
    }),
  );

runProviderConformance(provider(false, true), {
  name: 'filesystem (directory handle)',
  asset: { pagePath: 'guides/auth/index.md', href: './assets/flow.png' },
});

// The same store again, on an engine whose file handles cannot rename: writes go direct.
runProviderConformance(provider(false, false), { name: 'filesystem (no native rename)' });

runProviderConformance(provider(true, true), { name: 'filesystem (read-only)' });
