import { describe, expect, it } from 'vitest';
import {
  BackendMetaSchema,
  ErrorSchema,
  PageDocumentSchema,
  PageIconSchema,
  PageMetaSchema,
  TreeNodeSchema,
} from './schemas.js';

describe('contract schemas', () => {
  it('keeps unknown frontmatter keys on PageMeta', () => {
    const parsed = PageMetaSchema.parse({ title: 'A', tags: ['x'], draft: true });
    expect(parsed).toEqual({ title: 'A', tags: ['x'], draft: true });
  });

  it('rejects an unknown icon kind', () => {
    expect(PageIconSchema.safeParse({ kind: 'svg', value: '<svg/>' }).success).toBe(false);
    expect(PageIconSchema.safeParse({ kind: 'emoji', value: '🧠' }).success).toBe(true);
  });

  it('requires an explicit parentId on a tree node', () => {
    const base = { id: 'a', kind: 'page', title: 'A', path: 'a.md', childIds: [] };
    expect(TreeNodeSchema.safeParse(base).success).toBe(false);
    expect(TreeNodeSchema.safeParse({ ...base, parentId: null }).success).toBe(true);
  });

  it('rejects a page document without a version', () => {
    const doc = { id: 'a', meta: {}, body: '', version: '', updatedAt: '2026-01-01T00:00:00Z' };
    expect(PageDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('carries currentVersion on a conflict envelope', () => {
    const parsed = ErrorSchema.parse({
      error: { code: 'conflict', message: 'stale', currentVersion: 'sha256:abc' },
    });
    expect(parsed.error.currentVersion).toBe('sha256:abc');
  });

  it('rejects a backend meta with a missing capability', () => {
    expect(
      BackendMetaSchema.safeParse({
        contractVersion: 1,
        capabilities: { write: true, move: true, delete: true, upload: true, search: true },
      }).success,
    ).toBe(false);
  });
});
