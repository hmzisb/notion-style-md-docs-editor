import {
  ConflictError,
  ProviderError,
  isConflictError,
  isProviderError,
  type DocumentProvider,
  type FileStore,
  type NodeId,
  type ProviderErrorCode,
} from '@docs/core';
import { HttpResponse, http, type RequestHandler } from 'msw';

/**
 * The HTTP contract of docs/03 section 9, server side, over any `DocumentProvider` (docs/09
 * P1-T10). This is a test double, not a backend: it exists so the conformance suite can run
 * through a real request and response, and so the adapter's status and header handling is
 * checked against the contract rather than against a mock of itself.
 */

export interface DocsBackend {
  provider: DocumentProvider;
  /** Serves `GET /assets/*`, which the provider interface has no method for. */
  store?: FileStore;
}

const STATUS: Record<ProviderErrorCode, number> = {
  validation: 400,
  forbidden: 403,
  not_found: 404,
  unsupported: 405,
  conflict: 409,
  quota: 507,
  network: 502,
  internal: 500,
};

const quote = (version: string): string => `"${version}"`;
const unquote = (etag: string | null): string | null =>
  etag === null ? null : etag.replace(/^W\//, '').replace(/^"(.*)"$/, '$1');

/** Errors always use the envelope (docs/03 section 9). */
function envelope(error: unknown): Response {
  const failure = isProviderError(error)
    ? error
    : new ProviderError('internal', error instanceof Error ? error.message : String(error));
  return HttpResponse.json(
    {
      error: {
        code: failure.code,
        message: failure.message,
        ...(isConflictError(failure) ? { currentVersion: failure.currentVersion } : {}),
      },
    },
    { status: STATUS[failure.code] },
  );
}

/** docs/03 section 9: both reads carry an ETag, so both answer a conditional request. */
function notModified(request: Request, version: string): Response | null {
  return unquote(request.headers.get('if-none-match')) === version
    ? new HttpResponse(null, { status: 304, headers: { ETag: quote(version) } })
    : null;
}

/** Every handler runs inside this, so a provider rejection is always a contract response. */
const guard =
  (handler: (args: { request: Request; params: Record<string, string> }) => Promise<Response>) =>
  async (args: { request: Request; params: unknown }): Promise<Response> => {
    try {
      return await handler({
        request: args.request,
        params: args.params as Record<string, string>,
      });
    } catch (error) {
      return envelope(error);
    }
  };

const idOf = (params: Record<string, string>): NodeId => params.id ?? '';

export function docsHandlers(baseUrl: string, backend: () => DocsBackend): RequestHandler[] {
  const at = (path: string): string => `${baseUrl}${path}`;
  const provider = (): DocumentProvider => backend().provider;

  return [
    http.get(
      at('/meta'),
      guard(async () => HttpResponse.json(await provider().getMeta())),
    ),

    http.get(
      at('/tree'),
      guard(async ({ request }) => {
        const root = new URL(request.url).searchParams.get('root');
        const snapshot = await provider().getTree(root === null ? {} : { rootId: root });
        return (
          notModified(request, snapshot.version) ??
          HttpResponse.json(snapshot, { headers: { ETag: quote(snapshot.version) } })
        );
      }),
    ),

    http.get(
      at('/pages/:id'),
      guard(async ({ params, request }) => {
        const page = await provider().getPage(idOf(params));
        return (
          notModified(request, page.version) ??
          HttpResponse.json(page, { headers: { ETag: quote(page.version) } })
        );
      }),
    ),

    /** No `If-Match` asks for a folder to become a page; on a page it is the 412 case. */
    http.put(
      at('/pages/:id'),
      guard(async ({ request, params }) => {
        const id = idOf(params);
        const baseVersion = unquote(request.headers.get('if-match'));
        const input = (await request.json()) as { body: string };

        // A backend that cannot write answers that first: authorization outranks a precondition.
        const exists =
          provider().capabilities.write &&
          (await provider()
            .getPage(id)
            .then(
              () => true,
              () => false,
            ));
        if (baseVersion === null && exists) {
          return envelope(
            new ProviderError('conflict', 'If-Match is required to overwrite a page.'),
          );
        }

        const result = await provider().savePage(id, { body: input.body, baseVersion });
        return HttpResponse.json(result, {
          status: baseVersion === null ? 201 : 200,
          headers: { ETag: quote(result.version) },
        });
      }),
    ),

    http.patch(
      at('/pages/:id'),
      guard(async ({ request, params }) => {
        const patch = (await request.json()) as { title?: string; icon?: string };
        return HttpResponse.json(await provider().updateMeta(idOf(params), patch));
      }),
    ),

    http.post(
      at('/pages/:id/move'),
      guard(async ({ request, params }) => {
        const input = (await request.json()) as { parentId: NodeId | null; index: number };
        return HttpResponse.json(await provider().movePage(idOf(params), input));
      }),
    ),

    http.post(
      at('/pages/:id/assets'),
      guard(async ({ request, params }) => {
        const upload = provider().uploadAsset?.bind(provider());
        if (upload === undefined) {
          return envelope(new ProviderError('unsupported', 'This backend stores no uploads.'));
        }
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
          return envelope(new ProviderError('validation', 'Expected a file field.'));
        }
        return HttpResponse.json(await upload(idOf(params), file), { status: 201 });
      }),
    ),

    http.post(
      at('/pages'),
      guard(async ({ request }) => {
        const input = (await request.json()) as {
          parentId: NodeId | null;
          title: string;
          index?: number;
        };
        return HttpResponse.json(await provider().createPage(input), { status: 201 });
      }),
    ),

    http.delete(
      at('/pages/:id'),
      guard(async ({ params }) => {
        await provider().deletePage(idOf(params));
        return new HttpResponse(null, { status: 204 });
      }),
    ),

    http.get(
      at('/assets/*'),
      guard(async ({ request }) => {
        const { store } = backend();
        // `baseUrl` may carry an origin, so the prefix is found in the pathname, not sliced by length.
        const { pathname } = new URL(request.url);
        const path = decodeURIComponent(
          pathname.slice(pathname.indexOf('/assets/') + '/assets/'.length),
        );
        if (store === undefined) {
          return envelope(new ProviderError('not_found', `No asset at ${path}`));
        }
        return new HttpResponse(await store.readBinary(path));
      }),
    ),

    http.get(
      at('/search'),
      guard(async ({ request }) => {
        const search = provider().search?.bind(provider());
        if (search === undefined) {
          return envelope(new ProviderError('unsupported', 'This backend has no search.'));
        }
        const params = new URL(request.url).searchParams;
        const limit = params.get('limit');
        return HttpResponse.json(
          await search(params.get('q') ?? '', {
            ...(params.get('root') === null ? {} : { rootId: params.get('root') ?? undefined }),
            ...(limit === null ? {} : { limit: Number(limit) }),
          }),
        );
      }),
    ),

    /** `text/event-stream` of `ChangeEvent`, straight off the backing provider's own watcher. */
    http.get(
      at('/events'),
      guard(({ request }) => {
        const subscribe = provider().subscribe?.bind(provider());
        if (subscribe === undefined) {
          return Promise.resolve(
            envelope(new ProviderError('unsupported', 'This backend has no events.')),
          );
        }
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const off = subscribe((event) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            });
            request.signal.addEventListener('abort', () => {
              off();
              controller.close();
            });
          },
        });
        return Promise.resolve(
          new HttpResponse(stream, {
            headers: { 'cache-control': 'no-cache', 'content-type': 'text/event-stream' },
          }),
        );
      }),
    ),
  ];
}

/** Re-exported so a test can build the conflict the contract's 409 case describes. */
export { ConflictError };
