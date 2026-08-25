import type { DocumentProvider } from '@docs/core';
import { createMemoryProvider } from '@docs/react/adapters/memory';

/** Demo mode is the corpus, bundled as text at build time (docs/09 P1-T05). */
const CORPUS_PREFIX = '../../../fixtures/corpus/';

const corpus = import.meta.glob<string>('../../../fixtures/corpus/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const demoFiles = Object.fromEntries(
  Object.entries(corpus).map(([path, text]) => [path.slice(CORPUS_PREFIX.length), text]),
);

/** Folder, OPFS and remote modes arrive with P1-T11. */
export type Mode = 'demo';

const providers: Record<Mode, DocumentProvider> = {
  demo: createMemoryProvider({ files: demoFiles }),
};

export function providerFor(mode: Mode): DocumentProvider {
  return providers[mode];
}
