import { runProviderConformance } from './conformance.js';
import { loadCorpus } from './fixtures.js';
import { createFileStoreProvider } from '../fs/semantics.js';
import { MemoryFileStore, type MemoryFileSeed } from '../fs/memory-store.js';
import type { DocumentProvider } from '../provider.js';

/**
 * The corpus is the shared conformance seed: it has the folder without an index page,
 * the leaf pages, the unknown frontmatter keys and the relative asset every case needs.
 * `rules/*.md` are codec goldens and are left out, exactly as the walk leaves them out.
 */
const corpus = await loadCorpus();
const seed: MemoryFileSeed = {
  ...Object.fromEntries(corpus.manifest.pages.map((page) => [page.path, corpus.read(page.path)])),
  ...Object.fromEntries(corpus.assets),
};

const memoryProvider = (readOnly: boolean) => (): Promise<DocumentProvider> =>
  Promise.resolve(createFileStoreProvider(new MemoryFileStore(seed, { readOnly }), { title: 'Corpus' }));

runProviderConformance(memoryProvider(false), {
  name: 'memory',
  asset: { pagePath: 'guides/auth/index.md', href: './assets/flow.png' },
});

runProviderConformance(memoryProvider(true), { name: 'memory (read-only)' });
