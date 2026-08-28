import {
  MemoryFileStore,
  createFileStoreProvider,
  isConflictError,
  isProviderError,
  type ChangeEvent,
  type DocumentProvider,
} from '@hmzisb/notion-docs-core';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { docsHandlers, type DocsBackend } from './http-handlers.js';
import { createHttpProvider } from './http.js';

/** docs/03 section 9: the wire itself — status codes, ETags, the error envelope, headers. */

const BASE = 'http://docs.test/api';

const page = (id: string, title: string): string =>
  `---\nid: ${id}\ntitle: ${title}\n---\n\n# ${title}\n`;

const seed = {
  'index.md': page('p_home', 'Home'),
  'guides/index.md': page('p_guides', 'Guides'),
  'guides/auth.md': page('p_auth', 'Auth'),
  // A directory with no index page, so there is a folder node to convert into one.
  'notes/one.md': page('p_one', 'One'),
};

let backend: DocsBackend;
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

beforeEach(() => {
  const store = new MemoryFileStore(seed);
  backend = { store, provider: createFileStoreProvider(store, { title: 'Docs' }) };
});

const client = (opts: Partial<Parameters<typeof createHttpProvider>[0]> = {}): DocumentProvider =>
  createHttpProvider({ baseUrl: BASE, ...opts });

const codeOf = async (call: Promise<unknown>): Promise<string> => {
  try {
    await call;
    return 'resolved';
  } catch (error) {
    return isProviderError(error) ? error.code : `unexpected: ${String(error)}`;
  }
};

describe('createHttpProvider', () => {
  describe('capabilities', () => {
    it('refuses everything until getMeta has answered', () => {
      expect(client().capabilities).toEqual({
        write: false,
        move: false,
        delete: false,
        upload: false,
        search: false,
        subscribe: false,
      });
    });

    it('fills them from the backend, and leaves subscribe to the host', async () => {
      const provider = client();
      const meta = await provider.getMeta();

      expect(meta.capabilities.write).toBe(true);
      expect(provider.capabilities.write).toBe(true);
      // The memory store watches, so the backend advertises events - but this host asked for
      // none, and a capability is what the module may call (docs/03 section 9).
      expect(meta.capabilities.subscribe).toBe(false);
      expect(typeof provider.subscribe).toBe('undefined');
      expect(meta.title).toBe('Docs');
    });

    it('attaches an optional method only while its flag is on', async () => {
      const provider = client();
      expect(typeof provider.search).toBe('undefined');
      expect(typeof provider.uploadAsset).toBe('undefined');

      server.use(
        http.get(`${BASE}/meta`, () =>
          HttpResponse.json({
            contractVersion: 1,
            capabilities: {
              write: true,
              move: true,
              delete: true,
              upload: true,
              search: true,
              subscribe: true,
            },
          }),
        ),
        http.get(`${BASE}/search`, () =>
          HttpResponse.json([{ id: 'p_auth', title: 'Auth', path: 'guides/auth.md', score: 1 }]),
        ),
      );

      await provider.getMeta();
      expect(typeof provider.search).toBe('function');
      expect(typeof provider.uploadAsset).toBe('function');
      expect(await provider.search?.('auth')).toHaveLength(1);

      // A backend that later withdraws a capability withdraws the method with it.
      server.use(
        http.get(`${BASE}/meta`, () =>
          HttpResponse.json({
            contractVersion: 1,
            capabilities: {
              write: true,
              move: true,
              delete: true,
              upload: false,
              search: false,
              subscribe: true,
            },
          }),
        ),
      );
      await provider.getMeta();
      expect(typeof provider.search).toBe('undefined');
      expect(typeof provider.uploadAsset).toBe('undefined');
    });
  });

  describe('versions', () => {
    it('reads the version from the ETag and sends it back quoted', async () => {
      const provider = client();
      const sent: string[] = [];
      server.events.on('request:start', ({ request }) => {
        const match = request.headers.get('if-match');
        if (match !== null) sent.push(match);
      });

      const before = await provider.getPage('p_auth');
      const saved = await provider.savePage('p_auth', {
        body: '# Auth v2\n',
        baseVersion: before.version,
      });

      expect(sent).toEqual([`"${before.version}"`]);
      expect(saved.version).not.toBe(before.version);
      // The header is authoritative, and the contract carries it bare in the JSON.
      expect(saved.version.startsWith('"')).toBe(false);
      expect((await provider.getPage('p_auth')).body.trim()).toBe('# Auth v2');
    });

    it('turns a stale base into a conflict carrying the version the server holds', async () => {
      const provider = client();
      const current = await provider.getPage('p_auth');
      await provider.savePage('p_auth', { body: 'a\n', baseVersion: current.version });

      await expect(
        provider.savePage('p_auth', { body: 'b\n', baseVersion: current.version }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          isConflictError(error) && error.currentVersion !== '' && error.code === 'conflict',
      );
    });

    it('sends no If-Match when the base is null, and the server answers 201', async () => {
      const provider = client();
      const created: number[] = [];
      server.events.on('response:mocked', ({ response }) => {
        created.push(response.status);
      });

      const folder = (await provider.getTree()).nodes.find((node) => node.kind === 'folder');
      expect(folder).toBeDefined();
      await provider.savePage(folder?.id ?? '', { body: 'converted\n', baseVersion: null });
      expect(created).toContain(201);
    });
  });

  describe('errors', () => {
    it('maps the envelope, not the status, when the backend sends one', async () => {
      const provider = client();
      expect(await codeOf(provider.getPage('p_nope'))).toBe('not_found');

      server.use(
        http.get(`${BASE}/tree`, () =>
          HttpResponse.json(
            { error: { code: 'quota', message: 'Out of room.' } },
            // A backend whose status and envelope disagree: the envelope is the contract.
            { status: 500 },
          ),
        ),
      );
      expect(await codeOf(provider.getTree())).toBe('quota');
    });

    it('falls back to the status when the body is not the envelope', async () => {
      const provider = client();
      server.use(http.get(`${BASE}/tree`, () => new HttpResponse('nope', { status: 403 })));
      expect(await codeOf(provider.getTree())).toBe('forbidden');
    });

    it('reports a rejected fetch as network, with the base url in the message', async () => {
      const provider = client({
        fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      });
      const error: unknown = await provider.getTree().catch((reason: unknown) => reason);

      expect(isProviderError(error)).toBe(true);
      if (!isProviderError(error)) return;
      expect(error.code).toBe('network');
      expect(error.message).toContain(BASE);
    });

    it('reports a body the contract does not describe as internal', async () => {
      const provider = client();
      server.use(http.get(`${BASE}/tree`, () => HttpResponse.json({ nodes: 'not an array' })));
      expect(await codeOf(provider.getTree())).toBe('internal');
    });

    it('refuses a file rename, which the contract cannot express', async () => {
      const provider = client();
      expect(
        await codeOf(provider.updateMeta('p_auth', { title: 'Renamed' }, { renameFile: true })),
      ).toBe('unsupported');
    });
  });

  describe('request shape', () => {
    it('carries headers from a sync or an async supplier, plus credentials', async () => {
      const seen: RequestInit[] = [];
      const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init ?? {});
        return fetch(input, init);
      });

      await client({ fetch: spy, headers: () => ({ authorization: 'Bearer sync' }) }).getTree();
      await client({
        fetch: spy,
        credentials: 'include',
        headers: () => Promise.resolve({ authorization: 'Bearer async' }),
      }).getTree();

      expect(new Headers(seen[0]?.headers).get('authorization')).toBe('Bearer sync');
      expect(seen[0]?.credentials).toBeUndefined();
      expect(new Headers(seen[1]?.headers).get('authorization')).toBe('Bearer async');
      expect(seen[1]?.credentials).toBe('include');
    });

    it('keeps the per-request content type over a supplier that sets one', async () => {
      const provider = client({ headers: () => ({ 'content-type': 'text/plain' }) });
      const current = await provider.getPage('p_auth');
      // A PUT whose body is JSON must stay JSON however the host fills its headers.
      await expect(
        provider.savePage('p_auth', { body: 'ok\n', baseVersion: current.version }),
      ).resolves.toBeDefined();
    });

    it('sends the configured root on tree and search, and lets a call override it', async () => {
      const roots: (string | null)[] = [];
      server.use(
        http.get(`${BASE}/tree`, ({ request }) => {
          roots.push(new URL(request.url).searchParams.get('root'));
          return HttpResponse.json({ version: 'v1', nodes: [], rootIds: [] });
        }),
      );

      await client({ rootId: 'p_guides' }).getTree();
      await client({ rootId: 'p_guides' }).getTree({ rootId: 'p_home' });
      await client().getTree();

      expect(roots).toEqual(['p_guides', 'p_home', null]);
    });
  });

  describe('assets', () => {
    it('resolves against the page directory without a round trip', async () => {
      const provider = client();
      const node = (await provider.getTree()).nodes.find(
        (entry) => entry.path === 'guides/auth.md',
      );
      expect(node).toBeDefined();
      if (!node) return;

      expect(await provider.assetUrl('./assets/flow.png', node)).toBe(
        `${BASE}/assets/guides/assets/flow.png`,
      );
      expect(await provider.assetUrl('/logo.png', node)).toBe(`${BASE}/assets/logo.png`);
      expect(await codeOf(provider.assetUrl('../../../etc/passwd', node))).toBe('validation');
    });

    /**
     * The body is a `FormData`, which the runtime serializes with a boundary of its own - so
     * the request must carry no content type of ours, or that boundary is lost. jsdom cannot
     * send a multipart body through `fetch`, so the request is read where it is made.
     */
    it('posts the file as multipart and gets back the path that goes in the Markdown', async () => {
      let sent: [string, RequestInit | undefined] | undefined;
      const urlOf = (input: URL | RequestInfo): string =>
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const provider = client({
        fetch: (input, init) => {
          if (urlOf(input).endsWith('/meta')) return fetch(input, init);
          sent = [urlOf(input), init];
          return Promise.resolve(
            HttpResponse.json(
              { path: 'assets/flow.png', url: `${BASE}/assets/guides/assets/flow.png` },
              { status: 201 },
            ),
          );
        },
      });
      // The capability arrives with the meta, and the method with the capability.
      await provider.getMeta();

      const uploaded = await provider.uploadAsset?.('p_auth', new File(['bytes'], 'Flow.png'));

      expect(uploaded).toEqual({
        path: 'assets/flow.png',
        url: `${BASE}/assets/guides/assets/flow.png`,
      });
      expect(sent?.[0]).toBe(`${BASE}/pages/p_auth/assets`);
      expect(sent?.[1]?.method).toBe('POST');
      expect(new Headers(sent?.[1]?.headers).get('content-type')).toBeNull();

      const body = sent?.[1]?.body;
      const file = body instanceof FormData ? body.get('file') : null;
      expect(file instanceof File ? file.name : null).toBe('Flow.png');
    });

    it('escapes each segment, and leaves an external href alone', async () => {
      const provider = client();
      const node = (await provider.getTree()).nodes.find(
        (entry) => entry.path === 'guides/auth.md',
      );
      if (!node) return;

      expect(await provider.assetUrl('./a b/caf\u00e9.png', node)).toBe(
        `${BASE}/assets/guides/a%20b/caf%C3%A9.png`,
      );
      expect(await provider.assetUrl('https://cdn.example.com/x.png', node)).toBe(
        'https://cdn.example.com/x.png',
      );
    });
  });

  it('deletes through a 204, which carries no body to parse', async () => {
    const provider = client();
    await expect(provider.deletePage('p_auth')).resolves.toBeUndefined();
    expect(await codeOf(provider.getPage('p_auth'))).toBe('not_found');
  });

  it('trims a trailing slash off the base url so no path doubles it', async () => {
    const provider = client({ baseUrl: `${BASE}/` });
    expect(provider.key).toBe(`http:${BASE}`);
    await expect(provider.getTree()).resolves.toBeDefined();
  });
});

/**
 * docs/03 section 9 and docs/04 section 5, P4-T02. `sse` reads the event stream; `poll` asks
 * the two conditional questions the module acts on. Both reconnect with backoff, and neither
 * reports our own save back to us.
 */
describe('change events', () => {
  const events = (provider: DocumentProvider): ChangeEvent[] => {
    const seen: ChangeEvent[] = [];
    provider.subscribe?.((event) => seen.push(event));
    return seen;
  };

  const idOf = async (provider: DocumentProvider, title: string): Promise<string> => {
    const node = (await provider.getTree()).nodes.find((candidate) => candidate.title === title);
    if (!node) throw new Error(`no node titled ${title}`);
    return node.id;
  };

  it('is off unless the host asked for it', async () => {
    const provider = client({ events: 'none' });
    await provider.getMeta();
    expect(provider.capabilities.subscribe).toBe(false);
    expect(typeof provider.subscribe).toBe('undefined');
  });

  it('streams what the backend pushes, over sse', async () => {
    const provider = client({ events: 'sse' });
    await provider.getMeta();
    expect(provider.capabilities.subscribe).toBe(true);
    const seen = events(provider);

    const id = await idOf(provider, 'Auth');
    await provider.getPage(id);
    // Straight through the store, which is what an edit by anything but this client looks like.
    await backend.store?.writeText('guides/auth.md', '---\nid: p_auth\ntitle: Auth\n---\n\nNew.\n');

    await vi.waitFor(() => {
      expect(seen).toContainEqual(expect.objectContaining({ type: 'page', id }));
    });
    provider.dispose?.();
  });

  it('reconnects after the stream fails, backing off between attempts', async () => {
    const attempts: number[] = [];
    server.use(
      http.get(`${BASE}/events`, () => {
        attempts.push(performance.now());
        // Two refusals, then the handler below it (the real stream) takes over.
        return attempts.length <= 2 ? new HttpResponse(null, { status: 503 }) : undefined;
      }),
    );

    const step = 40;
    const provider = client({ events: 'sse', pollIntervalMs: step });
    await provider.getMeta();
    const seen = events(provider);

    const id = await idOf(provider, 'Auth');
    await provider.getPage(id);
    await vi.waitFor(
      () => {
        expect(attempts.length).toBeGreaterThanOrEqual(3);
      },
      { timeout: 2000 },
    );
    // One period, then two: the wait doubles for as long as the backend refuses.
    expect((attempts[1] ?? 0) - (attempts[0] ?? 0)).toBeGreaterThanOrEqual(step * 0.9);
    expect((attempts[2] ?? 0) - (attempts[1] ?? 0)).toBeGreaterThanOrEqual(step * 1.9);

    await backend.store?.writeText(
      'guides/auth.md',
      '---\nid: p_auth\ntitle: Auth\n---\n\nBack.\n',
    );
    await vi.waitFor(() => {
      expect(seen).toContainEqual(expect.objectContaining({ type: 'page', id }));
    });
    provider.dispose?.();
  });

  it('polls the tree and the open page conditionally', async () => {
    const seenRequests: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.headers.get('if-none-match') !== null) seenRequests.push(request.url);
    });

    const provider = client({ events: 'poll', pollIntervalMs: 10 });
    await provider.getMeta();
    const id = await idOf(provider, 'Auth');
    await provider.getPage(id);
    const seen = events(provider);

    await vi.waitFor(() => {
      expect(seenRequests.filter((url) => url.endsWith('/tree')).length).toBeGreaterThan(0);
      expect(seenRequests.filter((url) => url.includes('/pages/')).length).toBeGreaterThan(0);
    });
    // Nothing changed, so every one of those answered 304 and nobody heard about it.
    expect(seen).toEqual([]);

    await backend.store?.writeText(
      'guides/auth.md',
      '---\nid: p_auth\ntitle: Auth\n---\n\nEdit.\n',
    );
    await vi.waitFor(() => {
      expect(seen).toContainEqual(expect.objectContaining({ type: 'page', id }));
    });
    provider.dispose?.();
    server.events.removeAllListeners();
  });

  it('reports a page added elsewhere as a tree event', async () => {
    const provider = client({ events: 'poll', pollIntervalMs: 10 });
    await provider.getMeta();
    await provider.getTree();
    const seen = events(provider);

    await backend.store?.writeText('guides/new.md', '---\ntitle: Newcomer\n---\n\nHi.\n');

    await vi.waitFor(() => {
      expect(seen).toContainEqual(expect.objectContaining({ type: 'tree' }));
    });
    provider.dispose?.();
  });

  it('does not report our own save back to us', async () => {
    const provider = client({ events: 'poll', pollIntervalMs: 10 });
    await provider.getMeta();
    const id = await idOf(provider, 'Auth');
    const page = await provider.getPage(id);
    const seen = events(provider);

    await provider.savePage(id, { body: 'Mine.\n', baseVersion: page.version });
    // Several poll periods: the version the backend reports is the one we wrote.
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(seen.filter((event) => event.type === 'page')).toEqual([]);
    provider.dispose?.();
  });

  it('stops the connection when the last listener leaves', async () => {
    let open = 0;
    server.use(
      http.get(`${BASE}/tree`, () => {
        open += 1;
        return undefined;
      }),
    );
    const provider = client({ events: 'poll', pollIntervalMs: 10 });
    await provider.getMeta();
    const off = provider.subscribe?.(() => undefined);
    await vi.waitFor(() => {
      expect(open).toBeGreaterThan(0);
    });

    off?.();
    const after = open;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(open).toBe(after);
  });
});
