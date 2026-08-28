import {
  MemoryFileStore,
  createFileStoreProvider,
  type DocumentProvider,
} from '@hmzisb/notion-docs-core';
import { loadCorpus, runProviderConformance } from '@hmzisb/notion-docs-core/testing';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { docsHandlers, type DocsBackend } from './http-handlers.js';
import { createHttpProvider } from './http.js';

/**
 * docs/03 section 10: the http adapter answers the same contract, over a real request and a
 * real response. The backend behind msw is the memory provider, so any difference the suite
 * finds belongs to the wire, not to the semantics.
 */
// jsdom transforms this file for the browser, where `import.meta.url` is an http URL and the
// loader's own default root cannot be resolved. Vitest runs it from the package directory.
const corpus = await loadCorpus();
const seed: Record<string, string | Uint8Array> = {
  ...Object.fromEntries(corpus.manifest.pages.map((page) => [page.path, corpus.read(page.path)])),
  ...Object.fromEntries(corpus.assets),
};

const BASE = 'http://docs.test/api';

/** One backend per case: the suite's write cases must not see each other's edits. */
let backend: DocsBackend = makeBackend(false);

function makeBackend(readOnly: boolean): DocsBackend {
  const store = new MemoryFileStore(seed, { readOnly });
  return { store, provider: createFileStoreProvider(store, { title: 'Corpus' }) };
}

const server = setupServer(...docsHandlers(BASE, () => backend));

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const provider = (readOnly: boolean) => async (): Promise<DocumentProvider> => {
  backend = makeBackend(readOnly);
  const client = createHttpProvider({ baseUrl: BASE });
  // `capabilities` is the conservative all-false answer until the first round trip, and the
  // suite reads it synchronously, so the handshake happens before the provider is handed over.
  await client.getMeta();
  return client;
};

runProviderConformance(provider(false), {
  name: 'http (msw)',
  asset: { pagePath: 'guides/auth/index.md', href: './assets/flow.png' },
});

runProviderConformance(provider(true), { name: 'http (read-only)' });
