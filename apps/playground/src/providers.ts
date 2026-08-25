import type { DocumentProvider } from '@docs/core';
import { createMemoryProvider } from '@docs/react/adapters/memory';

/** Demo mode is the corpus, bundled as text at build time (docs/09 P1-T05). */
const CORPUS_PREFIX = '../../../fixtures/corpus/';

const corpus = import.meta.glob<string>('../../../fixtures/corpus/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The images the corpus links to, inlined by Vite so they need no server of their own. */
const assets = import.meta.glob<string>(
  '../../../fixtures/corpus/**/*.{png,svg,jpg,jpeg,gif,webp}',
  {
    query: '?inline',
    import: 'default',
    eager: true,
  },
);

const demoFiles: Record<string, string | Uint8Array> = {
  ...Object.fromEntries(
    Object.entries(corpus).map(([path, text]) => [path.slice(CORPUS_PREFIX.length), text]),
  ),
  ...Object.fromEntries(
    Object.entries(assets).map(([path, url]) => [path.slice(CORPUS_PREFIX.length), bytesOf(url)]),
  ),
};

/** `?inline` gives a data URL; the store wants the bytes behind it. */
function bytesOf(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const text = head.endsWith(';base64') ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** Folder, OPFS and remote modes arrive with P1-T11. */
export type Mode = 'demo';

const providers: Record<Mode, DocumentProvider> = {
  demo: createMemoryProvider({ files: demoFiles }),
};

export function providerFor(mode: Mode): DocumentProvider {
  return providers[mode];
}
