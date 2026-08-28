import {
  BackendMetaSchema,
  ChangeEventSchema,
  ConflictError,
  ErrorSchema,
  PageDocumentSchema,
  ProviderError,
  SaveResultSchema,
  SearchHitSchema,
  TreeNodeSchema,
  TreeSnapshotSchema,
  UploadAssetResultSchema,
  assetBaseFor,
  joinPath,
  normalizePath,
  parseHref,
  type BackendMeta,
  type ChangeEvent,
  type DocumentProvider,
  type NodeId,
  type PageDocument,
  type PageMetaPatch,
  type ProviderCapabilities,
  type ProviderErrorCode,
  type SaveResult,
  type SearchHit,
  type TreeNode,
  type TreeSnapshot,
} from '@hmzisb/notion-docs-core';

/**
 * The HTTP contract of docs/03 section 9, client side. Every response is parsed against the
 * schema the OpenAPI document is generated from, so a backend that drifts fails at the seam
 * with a readable error rather than three layers up in a component.
 */

export interface HttpProviderOptions {
  /** Base path of the API, e.g. `/api/docs` or `https://example.com/api/docs`. */
  baseUrl: string;
  /** Injected for tests, or to wrap the call in a retry or a tracer. */
  fetch?: typeof globalThis.fetch;
  /** Auth. Called per request, so a token can be refreshed between them. */
  headers?: () => HeadersInit | Promise<HeadersInit>;
  credentials?: RequestCredentials;
  /** Serve only this subtree. */
  rootId?: NodeId;
  /**
   * Change events (docs/03 section 9). `sse` reads `GET /events`; `poll` re-reads the tree and
   * the page last read, both with `If-None-Match`. Default `none`: a host that does not ask for
   * events gets no background traffic, whatever the backend advertises.
   */
  events?: 'sse' | 'poll' | 'none';
  /** Poll period, and the first backoff step after a failed connection. Default 5 s. */
  pollIntervalMs?: number;
}

const DEFAULT_POLL_MS = 5000;
/** Long enough that a backend that is down is left alone, short enough to feel automatic. */
const MAX_BACKOFF_MS = 30_000;

/**
 * `data:` lines of one `text/event-stream`, as they arrive. Comments (`:`), other fields and
 * the retry hint are not part of what this contract carries, so they are skipped.
 */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        // A frame ends at a blank line; `\r\n` is as legal as `\n` on the wire.
        const blank = /\r?\n\r?\n/.exec(buffer);
        if (blank === null) break;
        const frame = buffer.slice(0, blank.index);
        buffer = buffer.slice(blank.index + blank[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trimStart())
          .join('\n');
        if (data !== '') yield data;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** docs/03 section 9: JSON carries versions bare, headers quoted. */
const quote = (version: string): string => `"${version}"`;
const unquote = (etag: string | null): string | null =>
  etag === null ? null : etag.replace(/^W\//, '').replace(/^"(.*)"$/, '$1');

/** core builds its schemas with `zod/mini`, which has no `.array()`; this is that one line. */
const SearchHitsSchema = {
  parse: (value: unknown): SearchHit[] => {
    if (!Array.isArray(value)) throw new TypeError('Expected an array of search hits.');
    const hits: unknown[] = value;
    return hits.map((hit) => SearchHitSchema.parse(hit));
  },
};

/** Only used when the body is not the contract's error envelope. */
function codeForStatus(status: number): ProviderErrorCode {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 405 || status === 501) return 'unsupported';
  if (status === 409 || status === 412) return 'conflict';
  if (status === 413 || status === 507) return 'quota';
  return 'internal';
}

/** Reorders `parsed` to match the key order the server sent, keeping any key it did not send. */
function inWireOrder<T extends Record<string, unknown>>(parsed: T, raw: unknown): T {
  if (raw === null || typeof raw !== 'object') return parsed;
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (key in parsed) ordered[key] = parsed[key];
  }
  return { ...ordered, ...parsed };
}

export function createHttpProvider(opts: HttpProviderOptions): DocumentProvider {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const call = opts.fetch ?? globalThis.fetch.bind(globalThis);

  /**
   * Nothing is allowed until `getMeta` says so: a capability read before the first round trip
   * has to be the conservative answer, or the UI offers a button the backend will refuse.
   */
  const capabilities: ProviderCapabilities = {
    write: false,
    move: false,
    delete: false,
    upload: false,
    search: false,
    subscribe: false,
  };

  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers((await opts.headers?.()) ?? {});
    for (const [name, value] of new Headers(init.headers).entries()) headers.set(name, value);

    let response: Response;
    try {
      response = await call(`${baseUrl}${path}`, {
        ...init,
        headers,
        ...(opts.credentials === undefined ? {} : { credentials: opts.credentials }),
      });
    } catch (error) {
      // A rejected fetch is the offline case, which docs/06 section 11 gives its own card.
      throw new ProviderError('network', `Cannot reach ${baseUrl}.`, error);
    }
    // A conditional request answered `304 Not Modified` is a success with no body; only the
    // event poll below sends `If-None-Match`, and it reads the status rather than the payload.
    if (!response.ok && response.status !== 304) throw await errorFrom(response);
    return response;
  }

  async function errorFrom(response: Response): Promise<ProviderError> {
    const body: unknown = await response.json().catch(() => null);
    const envelope = ErrorSchema.safeParse(body);
    const { code, message, currentVersion, details } = envelope.success
      ? envelope.data.error
      : {
          code: codeForStatus(response.status),
          message: `${String(response.status)} ${response.statusText}`,
          currentVersion: undefined,
          details: undefined,
        };

    return code === 'conflict'
      ? new ConflictError(currentVersion ?? '', message)
      : new ProviderError(code, message, details);
  }

  /** The one place a response becomes a typed value, and the only one that trusts the server. */
  function parse<T>(schema: { parse: (value: unknown) => T }, body: unknown, url: string): T {
    try {
      return schema.parse(body);
    } catch (error) {
      throw new ProviderError(
        'internal',
        `The server returned a body this contract does not describe (${url}).`,
        error,
      );
    }
  }

  async function parsed<T>(
    schema: { parse: (value: unknown) => T },
    response: Response,
  ): Promise<T> {
    return parse(schema, await response.json().catch(() => undefined), response.url);
  }

  const query = (params: Record<string, string | number | undefined>): string => {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) search.set(name, String(value));
    }
    const text = search.toString();
    return text === '' ? '' : `?${text}`;
  };

  const jsonBody = (value: unknown): RequestInit => ({
    body: JSON.stringify(value),
    headers: { 'content-type': 'application/json' },
  });

  const idPath = (id: NodeId): string => `/pages/${encodeURIComponent(id)}`;

  async function uploadAsset(pageId: NodeId, file: File): Promise<{ path: string; url: string }> {
    const form = new FormData();
    form.set('file', file);
    const response = await send(`${idPath(pageId)}/assets`, { method: 'POST', body: form });
    return parsed(UploadAssetResultSchema, response);
  }

  async function search(
    queryText: string,
    searchOpts?: { rootId?: NodeId; limit?: number },
  ): Promise<SearchHit[]> {
    const root = searchOpts?.rootId ?? opts.rootId;
    const response = await send(
      `/search${query({ q: queryText, root, limit: searchOpts?.limit })}`,
    );
    return parsed(SearchHitsSchema, response);
  }

  // ---------------------------------------------------------------------- change events

  const mode = opts.events ?? 'none';
  const pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;
  const listeners = new Set<(event: ChangeEvent) => void>();
  /**
   * The version of every page this provider has read or written. A backend reports our own
   * save back to us like any other change, and a refetch of a page under a dirty editor is
   * what turns into a conflict banner (docs/04 section 5), so an echo is dropped here.
   */
  const seen = new Map<NodeId, string>();
  let treeVersion: string | null = null;
  /** What the poll asks about: in this module, the page the reader has open. */
  let lastRead: NodeId | null = null;
  let loop: AbortController | null = null;

  function announce(event: ChangeEvent): void {
    if (event.type === 'tree') {
      if (event.version === treeVersion) return;
      treeVersion = event.version;
    } else {
      if (seen.get(event.id) === event.version) return;
      seen.set(event.id, event.version);
    }
    for (const listener of listeners) listener(event);
  }

  const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        done();
      };
      function done(): void {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });

  /** One connection, held until the server closes it or the provider is disposed. */
  async function streamEvents(signal: AbortSignal): Promise<void> {
    const response = await send('/events', {
      headers: { accept: 'text/event-stream' },
      signal,
    });
    if (response.body === null) throw new ProviderError('internal', 'The event stream is empty.');
    for await (const data of sseData(response.body)) {
      let value: unknown;
      try {
        value = JSON.parse(data);
      } catch {
        // A frame this contract does not describe is not a reason to drop the connection.
        continue;
      }
      const event = ChangeEventSchema.safeParse(value);
      if (event.success) announce(event.data);
    }
  }

  /**
   * The contract has no "what changed" endpoint, so the poll asks the two questions the module
   * acts on, both conditionally: is the tree still this version, and is the open page.
   */
  async function pollOnce(signal: AbortSignal): Promise<void> {
    const tree = await send(`/tree${query({ root: opts.rootId })}`, {
      signal,
      ...(treeVersion === null ? {} : { headers: { 'if-none-match': quote(treeVersion) } }),
    });
    if (tree.status !== 304) {
      const snapshot = await parsed(TreeSnapshotSchema, tree);
      announce({ type: 'tree', version: snapshot.version });
    }

    const id = lastRead;
    const known = id === null ? undefined : seen.get(id);
    if (id === null || known === undefined) return;
    const page = await send(idPath(id), { signal, headers: { 'if-none-match': quote(known) } });
    if (page.status === 304) return;
    const document = await parsed(PageDocumentSchema, page);
    announce({ type: 'page', id, version: document.version });
  }

  /**
   * Reconnect with exponential backoff, from one poll period up to 30 s, reset by every
   * connection that worked. A backend that is down must not become a request per period.
   */
  async function run(signal: AbortSignal): Promise<void> {
    let backoff = pollMs;
    while (!signal.aborted) {
      try {
        if (mode === 'sse') await streamEvents(signal);
        else await pollOnce(signal);
        backoff = pollMs;
        // `sse` reconnects immediately after a clean close; `poll` waits out its period.
        if (mode === 'poll') await sleep(pollMs, signal);
      } catch {
        // Disposing aborts the request in flight, and the sleep below returns at once for an
        // aborted signal, so the loop condition is what ends this - a failed backend and a
        // disposed provider do not need to be told apart here.
        await sleep(backoff, signal);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }

  function subscribe(listener: (event: ChangeEvent) => void): () => void {
    listeners.add(listener);
    if (loop === null) {
      const controller = new AbortController();
      loop = controller;
      void run(controller.signal);
    }
    return (): void => {
      listeners.delete(listener);
      // Nothing is listening, so nothing is worth a connection.
      if (listeners.size === 0) stopEvents();
    };
  }

  function stopEvents(): void {
    loop?.abort();
    loop = null;
  }

  const provider: DocumentProvider = {
    key: `http:${baseUrl}`,
    capabilities,

    async getMeta(): Promise<BackendMeta> {
      const meta = await parsed(BackendMetaSchema, await send('/meta'));
      // A capability is what the module may call: events the host switched off are not
      // available, however the backend answers (docs/03 section 9).
      Object.assign(capabilities, meta.capabilities, {
        subscribe: meta.capabilities.subscribe && mode !== 'none',
      });

      // An optional method must exist exactly when its flag is on (docs/03 section 10), and
      // the flags are only known now, so the surface is settled here rather than at construction.
      if (capabilities.upload) provider.uploadAsset = uploadAsset;
      else delete provider.uploadAsset;
      if (capabilities.search) provider.search = search;
      else delete provider.search;
      if (capabilities.subscribe) provider.subscribe = subscribe;
      else {
        delete provider.subscribe;
        stopEvents();
      }

      return { ...meta, capabilities: { ...capabilities } };
    },

    async getTree(treeOpts?: { rootId?: NodeId }): Promise<TreeSnapshot> {
      const root = treeOpts?.rootId ?? opts.rootId;
      const snapshot = await parsed(TreeSnapshotSchema, await send(`/tree${query({ root })}`));
      if (root === opts.rootId) treeVersion = snapshot.version;
      return snapshot;
    },

    async getPage(id: NodeId): Promise<PageDocument> {
      const response = await send(idPath(id));
      const body: unknown = await response.json().catch(() => undefined);
      const page = parse(PageDocumentSchema, body, response.url);
      seen.set(id, page.version);
      lastRead = id;
      // Frontmatter order is part of the contract (docs/03 section 4.2) and a schema parse
      // rebuilds an object in schema order, so the wire's order is put back afterwards.
      return {
        ...page,
        meta: inWireOrder(page.meta, (body as { meta?: unknown } | undefined)?.meta),
      };
    },

    /**
     * `baseVersion` is the `If-Match` precondition. Sending none is how the contract asks for
     * a folder to become a page (201); on a page that already exists the backend answers 412,
     * which arrives here as a conflict like any other lost race.
     */
    async savePage(
      id: NodeId,
      input: { body: string; baseVersion: string | null },
    ): Promise<SaveResult> {
      const response = await send(idPath(id), {
        method: 'PUT',
        ...jsonBody({ body: input.body }),
        ...(input.baseVersion === null
          ? {}
          : { headers: { 'if-match': quote(input.baseVersion) } }),
      });
      const result = await parsed(SaveResultSchema, response);
      const version = unquote(response.headers.get('etag')) ?? result.version;
      // What we just wrote is not news when the backend reports it back (docs/04 section 5).
      seen.set(id, version);
      return { ...result, version };
    },

    async updateMeta(
      id: NodeId,
      patch: PageMetaPatch,
      metaOpts?: { renameFile?: boolean },
    ): Promise<TreeNode> {
      if (metaOpts?.renameFile === true) {
        throw new ProviderError(
          'unsupported',
          'The HTTP contract has no way to ask for a file rename; the backend owns that policy.',
        );
      }
      return parsed(
        TreeNodeSchema,
        await send(idPath(id), { method: 'PATCH', ...jsonBody(patch) }),
      );
    },

    async createPage(input: {
      parentId: NodeId | null;
      title: string;
      index?: number;
    }): Promise<TreeNode> {
      return parsed(TreeNodeSchema, await send('/pages', { method: 'POST', ...jsonBody(input) }));
    },

    async movePage(
      id: NodeId,
      input: { parentId: NodeId | null; index: number },
    ): Promise<TreeNode> {
      const response = await send(`${idPath(id)}/move`, { method: 'POST', ...jsonBody(input) });
      return parsed(TreeNodeSchema, response);
    },

    async deletePage(id: NodeId): Promise<void> {
      await send(idPath(id), { method: 'DELETE' });
    },

    /**
     * A remote store answers with an addressable URL rather than an object URL, so this is
     * pure path work: resolve against the page's directory and hand back `/assets/<path>`.
     */
    assetUrl(relativePath: string, page: TreeNode): Promise<string> {
      const href = parseHref(relativePath);
      if (href.external) return Promise.resolve(relativePath);

      const rooted = href.path.startsWith('/');
      const target = normalizePath(
        rooted ? href.path : joinPath(assetBaseFor(page.path), href.path),
      );
      if (target === null || target === '') {
        return Promise.reject(
          new ProviderError('validation', `Asset path escapes the root: ${relativePath}`),
        );
      }
      const encoded = target.split('/').map(encodeURIComponent).join('/');
      return Promise.resolve(`${baseUrl}/assets/${encoded}`);
    },

    dispose(): void {
      listeners.clear();
      stopEvents();
    },
  };

  return provider;
}
