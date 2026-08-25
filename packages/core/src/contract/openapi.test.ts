import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument, serializeOpenApiDocument } from './openapi.js';
import { CONTRACT_SCHEMAS } from './schemas.js';

const COMMITTED = new URL('../../../../contract/openapi.json', import.meta.url);

describe('openapi generator', () => {
  it('emits every named schema under components', () => {
    const doc = buildOpenApiDocument() as { components: { schemas: Record<string, unknown> } };
    expect(Object.keys(doc.components.schemas).sort()).toEqual(
      Object.keys(CONTRACT_SCHEMAS).sort(),
    );
  });

  it('cross-references schemas instead of inlining them', () => {
    const doc = buildOpenApiDocument() as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    expect(doc.components.schemas.BackendMeta?.properties?.capabilities).toEqual({
      $ref: '#/components/schemas/ProviderCapabilities',
    });
  });

  it('is deterministic', () => {
    expect(serializeOpenApiDocument()).toBe(serializeOpenApiDocument());
  });

  it('matches the committed contract/openapi.json', () => {
    expect(readFileSync(COMMITTED, 'utf8')).toBe(serializeOpenApiDocument());
  });
});
