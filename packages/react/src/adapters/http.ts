import {
  BackendMetaSchema,
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
} from '@docs/core';

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
  /** Change events. P4-T02 implements `sse` and `poll`; until then nothing subscribes. */
  events?: 'sse' | 'poll' | 'none';
  pollIntervalMs?: number;
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
    if (!response.ok) throw await errorFrom(response);
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

  const provider: DocumentProvider = {
    key: `http:${baseUrl}`,
    capabilities,

    async getMeta(): Promise<BackendMeta> {
      const meta = await parsed(BackendMetaSchema, await send('/meta'));
      // P4-T02 owns `subscribe`; advertising it with no listener behind it is what breaks
      // the callers that trust the flag, so it stays off however the backend answers.
      Object.assign(capabilities, meta.capabilities, { subscribe: false });

      // An optional method must exist exactly when its flag is on (docs/03 section 10), and
      // the flags are only known now, so the surface is settled here rather than at construction.
      if (capabilities.upload) provider.uploadAsset = uploadAsset;
      else delete provider.uploadAsset;
      if (capabilities.search) provider.search = search;
      else delete provider.search;

      return { ...meta, capabilities: { ...capabilities } };
    },

    async getTree(treeOpts?: { rootId?: NodeId }): Promise<TreeSnapshot> {
      const root = treeOpts?.rootId ?? opts.rootId;
      return parsed(TreeSnapshotSchema, await send(`/tree${query({ root })}`));
    },

    async getPage(id: NodeId): Promise<PageDocument> {
      const response = await send(idPath(id));
      const body: unknown = await response.json().catch(() => undefined);
      const page = parse(PageDocumentSchema, body, response.url);
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
      return { ...result, version: unquote(response.headers.get('etag')) ?? result.version };
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
  };

  return provider;
}
