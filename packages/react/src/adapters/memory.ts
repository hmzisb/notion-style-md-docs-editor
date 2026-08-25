import {
  MemoryFileStore,
  ProviderError,
  createFileStoreProvider,
  joinFrontmatter,
  type BackendMeta,
  type DocumentProvider,
  type NodeId,
  type PageDocument,
  type ProviderCapabilities,
  type ProviderErrorCode,
  type TreeSnapshot,
} from '@docs/core';

/**
 * Either a set of Markdown files, which is what the demo corpus and the tests use, or a tree
 * with its pages, which is easier to hand-write for one screen (docs/08 section 7).
 */
export type MemorySeed =
  | { files: Record<string, string | Uint8Array> }
  | { tree: TreeSnapshot; pages: Record<NodeId, PageDocument> };

export interface MemoryProviderOptions {
  capabilities?: Partial<ProviderCapabilities>;
  /** Delay every call, so a skeleton or a pending state is actually visible while developing. */
  latencyMs?: number;
  /** The next call rejects with this code; the one after it behaves normally again. */
  failNext?: ProviderErrorCode;
  /** Overrides `memory:<seedHash>`, which is what the cache namespace is built from. */
  key?: string;
}

/**
 * A file seed goes straight into `MemoryFileStore`; a tree seed is rendered back to files, so
 * both shapes get the same core semantics (D-03) rather than a second implementation of ids,
 * ordering and slugs.
 */
function filesFrom(seed: MemorySeed): Record<string, string | Uint8Array> {
  if ('files' in seed) return seed.files;

  const files: Record<string, string> = {};
  for (const node of seed.tree.nodes) {
    const page = seed.pages[node.id];
    if (page === undefined) continue;
    files[node.path] = joinFrontmatter(page.meta, page.body, page.eol ?? 'lf');
  }
  return files;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * In-memory provider for demos, tests and the playground. `latencyMs` and `failNext` exist so
 * loading, error and offline states can be reproduced without a backend (docs/06 section 11).
 */
export function createMemoryProvider(
  seed: MemorySeed,
  { capabilities, latencyMs = 0, failNext, key }: MemoryProviderOptions = {},
): DocumentProvider {
  const base = createFileStoreProvider(new MemoryFileStore(filesFrom(seed), { key }));
  if (capabilities === undefined && latencyMs === 0 && failNext === undefined) return base;

  const merged: ProviderCapabilities = { ...base.capabilities, ...capabilities };
  let pendingFailure = failNext;

  /** Runs before every call: one delay, and at most one injected failure. */
  const gate = async (): Promise<void> => {
    const code = pendingFailure;
    pendingFailure = undefined;
    if (latencyMs > 0) await delay(latencyMs);
    if (code !== undefined) throw new ProviderError(code, `Injected ${code} from the seed.`);
  };

  return new Proxy(base, {
    get(target, property, receiver): unknown {
      if (property === 'capabilities') return merged;

      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || property === 'dispose' || property === 'subscribe') {
        return value;
      }

      const method = value.bind(target) as (...args: unknown[]) => Promise<unknown>;
      if (property === 'getMeta') {
        return async (): Promise<BackendMeta> => {
          await gate();
          return { ...((await method()) as BackendMeta), capabilities: merged };
        };
      }
      return async (...args: unknown[]): Promise<unknown> => {
        await gate();
        return method(...args);
      };
    },
  });
}
