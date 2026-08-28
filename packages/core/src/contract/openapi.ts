/**
 * Generates `contract/openapi.json` from the zod schemas (D-01: the contract is
 * documented and generated, no server is built). Run with `pnpm contract:gen`.
 *
 * This file is a build-time generator, not part of the `@hmzisb/notion-docs-core` runtime graph:
 * it is the one place in core allowed to import `node:*`.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as z from 'zod/mini';
import { CONTRACT_SCHEMAS } from './schemas.js';
import { CONTRACT_VERSION } from './version.js';

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string) => ({ 'application/json': { schema: ref(id) } });
const errorResponse = (description: string) => ({
  description,
  content: json('ErrorEnvelope'),
});

const ETAG_HEADER = {
  ETag: { description: 'Quoted version.', schema: { type: 'string' } },
} as const;

const ID_PARAM = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Opaque node id.',
} as const;

export function buildOpenApiDocument(): Record<string, unknown> {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(CONTRACT_SCHEMAS)) {
    registry.add(schema, { id });
  }
  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
  });

  // `$schema` is meaningless inside an OpenAPI components block.
  for (const schema of Object.values(schemas)) {
    delete (schema as Record<string, unknown>).$schema;
    delete (schema as Record<string, unknown>).$id;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Docs module HTTP contract',
      version: `${CONTRACT_VERSION}.0.0`,
      description:
        'Client-side contract implemented by the `http` adapter of @hmzisb/notion-docs-react. ' +
        'Generated from the zod schemas in @hmzisb/notion-docs-core; do not edit by hand.',
      license: { name: 'MIT' },
    },
    servers: [{ url: '/api/docs', description: 'Host-defined base path.' }],
    paths: {
      '/meta': {
        get: {
          operationId: 'getMeta',
          summary: 'Backend capabilities and contract version.',
          responses: {
            '200': { description: 'Backend meta.', content: json('BackendMeta') },
          },
        },
      },
      '/tree': {
        get: {
          operationId: 'getTree',
          summary: 'Full ordered tree snapshot.',
          parameters: [
            {
              name: 'root',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Serve a scoped subtree.',
            },
          ],
          responses: {
            '200': {
              description: 'Tree snapshot.',
              headers: ETAG_HEADER,
              content: json('TreeSnapshot'),
            },
            '404': errorResponse('Unknown root id.'),
          },
        },
      },
      '/pages/{id}': {
        get: {
          operationId: 'getPage',
          parameters: [ID_PARAM],
          responses: {
            '200': {
              description: 'Page document.',
              headers: ETAG_HEADER,
              content: json('PageDocument'),
            },
            '404': errorResponse('Unknown page.'),
          },
        },
        put: {
          operationId: 'savePage',
          summary: 'Save the body. `If-Match` carries the base version.',
          parameters: [
            ID_PARAM,
            {
              name: 'If-Match',
              in: 'header',
              required: false,
              schema: { type: 'string' },
              description: 'Quoted base version. Omitted only when converting a folder to a page.',
            },
          ],
          requestBody: { required: true, content: json('SavePageInput') },
          responses: {
            '200': { description: 'Saved.', headers: ETAG_HEADER, content: json('SaveResult') },
            '201': {
              description: 'Folder converted to a page.',
              headers: ETAG_HEADER,
              content: json('SaveResult'),
            },
            '409': errorResponse('Version conflict; `currentVersion` is set.'),
            '412': errorResponse('`If-Match` missing on an existing page.'),
          },
        },
        patch: {
          operationId: 'updateMeta',
          parameters: [ID_PARAM],
          requestBody: { required: true, content: json('PageMetaPatch') },
          responses: {
            '200': { description: 'Updated node.', content: json('TreeNode') },
            '404': errorResponse('Unknown page.'),
          },
        },
        delete: {
          operationId: 'deletePage',
          summary: 'Delete the node and its whole subtree.',
          parameters: [ID_PARAM],
          responses: {
            '204': { description: 'Deleted.' },
            '404': errorResponse('Unknown page.'),
          },
        },
      },
      '/pages': {
        post: {
          operationId: 'createPage',
          requestBody: { required: true, content: json('CreatePageInput') },
          responses: {
            '201': { description: 'Created node.', content: json('TreeNode') },
            '404': errorResponse('Unknown parent.'),
          },
        },
      },
      '/pages/{id}/move': {
        post: {
          operationId: 'movePage',
          parameters: [ID_PARAM],
          requestBody: { required: true, content: json('MovePageInput') },
          responses: {
            '200': { description: 'Moved node.', content: json('TreeNode') },
            '400': errorResponse('Move into own subtree.'),
          },
        },
      },
      '/assets/{path}': {
        get: {
          operationId: 'getAsset',
          parameters: [
            {
              name: 'path',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Posix path relative to the root.',
            },
          ],
          responses: {
            '200': {
              description: 'Asset bytes.',
              content: { '*/*': { schema: { type: 'string', format: 'binary' } } },
            },
            '404': errorResponse('Unknown asset.'),
          },
        },
      },
      '/pages/{id}/assets': {
        post: {
          operationId: 'uploadAsset',
          summary: 'Requires `capabilities.upload`.',
          parameters: [ID_PARAM],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                  required: ['file'],
                },
              },
            },
          },
          responses: {
            '201': { description: 'Stored asset.', content: json('UploadAssetResult') },
            '405': errorResponse('Uploads unsupported.'),
          },
        },
      },
      '/search': {
        get: {
          operationId: 'search',
          summary: 'Requires `capabilities.search`.',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'root', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
          ],
          responses: {
            '200': {
              description: 'Hits.',
              content: {
                'application/json': {
                  schema: { type: 'array', items: ref('SearchHit') },
                },
              },
            },
            '405': errorResponse('Search unsupported.'),
          },
        },
      },
      '/events': {
        get: {
          operationId: 'events',
          summary: 'Server-sent stream of ChangeEvent. Requires `capabilities.subscribe`.',
          responses: {
            '200': {
              description: 'Event stream.',
              content: { 'text/event-stream': { schema: ref('ChangeEvent') } },
            },
            '405': errorResponse('Subscriptions unsupported.'),
          },
        },
      },
    },
    components: { schemas },
  };
}

/** Stable, diffable output: 2-space JSON with a trailing newline. */
export function serializeOpenApiDocument(): string {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
}

const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../contract/openapi.json',
);

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  writeFileSync(OUTPUT, serializeOpenApiDocument(), 'utf8');
  process.stdout.write(`contract/openapi.json written (${CONTRACT_VERSION})\n`);
}
