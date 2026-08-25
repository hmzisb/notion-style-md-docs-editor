import { describe, expect, it, onTestFinished } from 'vitest';
import type { DocumentProvider } from '../provider.js';
import type { NodeId, PageDocument, TreeNode, TreeSnapshot } from '../model.js';
import { KNOWN_META_KEYS } from '../frontmatter.js';
import { isConflictError, isProviderError } from '../errors.js';
import { buildIndex, isIndexPath, pathAliases } from '../tree.js';

/**
 * The contract every provider must satisfy (docs/03 section 10). One suite, run against
 * memory, the filesystem adapter over a directory handle and over real OPFS, and the
 * http adapter over msw: a backend that passes this is interchangeable with the others.
 *
 * Every case drives the provider through its public interface only, so nothing here
 * knows whether the bytes live in a Map, on disk or behind a fetch.
 */

export interface ConformanceOptions {
  /** Suite label, e.g. `memory` or `filesystem (OPFS)`. */
  name: string;
  /**
   * An asset the seed can serve, as the href a page body would carry. Without it the
   * asset cases still check traversal rejection, which needs no fixture.
   */
  asset?: { pagePath: string; href: string };
  /** How many pages the seed-shape probes may read before giving up. */
  scanLimit?: number;
}

/**
 * The seed a conformance run needs:
 * - at least three pages, one of them a leaf page (no children) that is safe to edit,
 * - one directory with no index page, so the folder cases have a folder node,
 * - one page carrying a frontmatter key outside `KNOWN_META_KEYS`.
 */
const SEED_HELP = 'see ConformanceOptions in @docs/core/testing for what the seed must contain';

const nodeByPath = (snapshot: TreeSnapshot, path: string): TreeNode | undefined =>
  snapshot.nodes.find((node) => node.path === path);

const pagesOf = (snapshot: TreeSnapshot): TreeNode[] =>
  snapshot.nodes.filter((node) => node.kind === 'page');

/** A page with no children: safe to convert, move and delete without taking a subtree along. */
const leafPageOf = (snapshot: TreeSnapshot): TreeNode | undefined =>
  pagesOf(snapshot).find((node) => node.childIds.length === 0 && !isIndexPath(node.path));

const folderOf = (snapshot: TreeSnapshot): TreeNode | undefined =>
  snapshot.nodes.find((node) => node.kind === 'folder');

const childrenOf = (snapshot: TreeSnapshot, parentId: NodeId | null): TreeNode[] =>
  snapshot.nodes.filter((node) => node.parentId === parentId);

const unknownKeys = (page: PageDocument): string[] =>
  Object.keys(page.meta).filter((key) => !(KNOWN_META_KEYS as readonly string[]).includes(key));

export function runProviderConformance(
  makeProvider: () => Promise<DocumentProvider>,
  opts: ConformanceOptions,
): void {
  const scanLimit = opts.scanLimit ?? 40;

  /** A provider per case: every write case mutates, and none may see another's edits. */
  async function fresh(): Promise<DocumentProvider> {
    const provider = await makeProvider();
    onTestFinished(() => {
      provider.dispose?.();
    });
    return provider;
  }

  describe(`provider conformance: ${opts.name}`, () => {
    describe('meta and capabilities', () => {
      it('reports a contract version and the same capabilities as the instance', async () => {
        const provider = await fresh();
        const meta = await provider.getMeta();

        expect(meta.contractVersion).toBeGreaterThanOrEqual(1);
        expect(meta.capabilities).toEqual(provider.capabilities);
        expect(provider.key).not.toBe('');
        for (const flag of Object.values(meta.capabilities)) expect(typeof flag).toBe('boolean');
      });

      it('backs every optional method it advertises, and only those', async () => {
        const provider = await fresh();
        const { search, subscribe, upload } = provider.capabilities;

        // An advertised capability with no method behind it crashes the UI that trusts it.
        if (search) expect(typeof provider.search).toBe('function');
        if (subscribe) expect(typeof provider.subscribe).toBe('function');
        if (upload) expect(typeof provider.uploadAsset).toBe('function');

        if (!subscribe) expect(typeof provider.subscribe).toBe('undefined');
        if (!upload) expect(typeof provider.uploadAsset).toBe('undefined');
        if (!search && provider.search) {
          await expect(provider.search('x')).rejects.toSatisfy(
            (error: unknown) => isProviderError(error) && error.code === 'unsupported',
          );
        }
      });

      it('answers search when it advertises it', async () => {
        const provider = await fresh();
        if (!provider.capabilities.search) return;
        expect(Array.isArray(await provider.search?.('the'))).toBe(true);
      });
    });

    describe('tree', () => {
      it('loads a tree with no orphan, no duplicate id and one root at most per entry', async () => {
        const provider = await fresh();
        const snapshot = await provider.getTree();

        expect(snapshot.version).not.toBe('');
        expect(snapshot.nodes.length).toBeGreaterThanOrEqual(3);

        const ids = snapshot.nodes.map((node) => node.id);
        expect(new Set(ids).size).toBe(ids.length);

        const index = buildIndex(snapshot);
        for (const node of snapshot.nodes) {
          if (node.parentId === null) {
            expect(index.rootIds).toContain(node.id);
            continue;
          }
          expect(
            index.byId[node.parentId],
            `${node.path} has a parent that is not in the tree`,
          ).toBeDefined();
          expect(index.byId[node.parentId]?.childIds).toContain(node.id);
        }
      });

      it('registers every path form of every node', async () => {
        const provider = await fresh();
        const index = buildIndex(await provider.getTree());
        for (const node of Object.values(index.byId)) {
          for (const alias of pathAliases(node.path)) {
            expect(index.idByPath[alias], `${alias} is missing from idByPath`).toBeDefined();
          }
          expect(index.idByPath[node.path]).toBe(node.id);
        }
      });

      it('serves a subtree when asked for one', async () => {
        const provider = await fresh();
        const snapshot = await provider.getTree();
        const parent = snapshot.nodes.find((node) => node.childIds.length > 0);
        expect(
          parent,
          `the conformance seed needs a node with children; ${SEED_HELP}`,
        ).toBeDefined();
        if (!parent) return;

        const scoped = await provider.getTree({ rootId: parent.id });
        expect(scoped.nodes[0]?.id).toBe(parent.id);
        expect(scoped.nodes[0]?.parentId).toBeNull();
        expect(scoped.nodes.length).toBeLessThanOrEqual(snapshot.nodes.length);
        for (const id of parent.childIds) {
          expect(scoped.nodes.some((node) => node.id === id)).toBe(true);
        }
      });

      it('rejects an unknown id', async () => {
        const provider = await fresh();
        for (const call of [
          (): Promise<unknown> => provider.getTree({ rootId: 'conformance-missing' }),
          (): Promise<unknown> => provider.getPage('conformance-missing'),
        ]) {
          await expect(call()).rejects.toSatisfy(
            (error: unknown) => isProviderError(error) && error.code === 'not_found',
          );
        }
      });
    });

    describe('page read', () => {
      it('returns a version, an ISO timestamp and an LF body', async () => {
        const provider = await fresh();
        const snapshot = await provider.getTree();
        const first = pagesOf(snapshot)[0];
        expect(first, `the conformance seed needs at least one page; ${SEED_HELP}`).toBeDefined();
        if (!first) return;

        const page = await provider.getPage(first.id);
        expect(page.id).toBe(first.id);
        expect(page.version).not.toBe('');
        expect(page.body).not.toContain('\r');
        expect(Number.isNaN(Date.parse(page.updatedAt))).toBe(false);
      });

      it('gives the same version for two reads of an unchanged page', async () => {
        const provider = await fresh();
        const first = pagesOf(await provider.getTree())[0];
        if (!first) return;
        expect((await provider.getPage(first.id)).version).toBe(
          (await provider.getPage(first.id)).version,
        );
      });
    });

    describe('save', () => {
      it('accepts the version it handed out and issues a new one', async () => {
        const provider = await fresh();
        if (!provider.capabilities.write) return;
        const target = leafPageOf(await provider.getTree());
        expect(target, `the conformance seed needs a leaf page; ${SEED_HELP}`).toBeDefined();
        if (!target) return;

        const before = await provider.getPage(target.id);
        const body = `${before.body}\n\nConformance appended this line.\n`;
        const result = await provider.savePage(target.id, { body, baseVersion: before.version });

        expect(result.version).not.toBe(before.version);
        expect(Number.isNaN(Date.parse(result.updatedAt))).toBe(false);

        const after = await provider.getPage(target.id);
        expect(after.version).toBe(result.version);
        expect(after.body).toBe(body);
      });

      it('changes nothing but the body, keeping unknown frontmatter keys in their order', async () => {
        const provider = await fresh();
        if (!provider.capabilities.write) return;

        const pages = pagesOf(await provider.getTree()).slice(0, scanLimit);
        let target: PageDocument | undefined;
        for (const node of pages) {
          const page = await provider.getPage(node.id);
          if (unknownKeys(page).length > 0) {
            target = page;
            break;
          }
        }
        expect(
          target,
          `the conformance seed needs a page with an unknown frontmatter key; ${SEED_HELP}`,
        ).toBeDefined();
        if (!target) return;

        await provider.savePage(target.id, {
          body: `${target.body}\nEdited.\n`,
          baseVersion: target.version,
        });
        const after = await provider.getPage(target.id);

        // Existing keys keep their order and their values; a first write may append an
        // `id` after them (docs/03 section 4.2), but it may never reorder or drop a key.
        const before = Object.keys(target.meta);
        expect(Object.keys(after.meta).slice(0, before.length)).toEqual(before);
        for (const key of before) expect(after.meta[key]).toEqual(target.meta[key]);
        expect(after.eol).toBe(target.eol);
      });

      it('rejects a stale base and reports the version it has', async () => {
        const provider = await fresh();
        if (!provider.capabilities.write) return;
        const target = leafPageOf(await provider.getTree());
        if (!target) return;

        const page = await provider.getPage(target.id);
        await provider.savePage(target.id, {
          body: 'First writer wins.\n',
          baseVersion: page.version,
        });

        await expect(
          provider.savePage(target.id, {
            body: 'Second writer loses.\n',
            baseVersion: page.version,
          }),
        ).rejects.toSatisfy((error: unknown) => {
          if (!isConflictError(error)) return false;
          expect(error.code).toBe('conflict');
          expect(error.currentVersion).not.toBe(page.version);
          return true;
        });
        // The blank line that separates frontmatter from prose belongs to the file, so
        // the body comes back with it; nothing else about the write may differ.
        expect((await provider.getPage(target.id)).body.trim()).toBe('First writer wins.');
      });

      it('turns a folder into a page on a save with a null base, keeping its id', async () => {
        const provider = await fresh();
        if (!provider.capabilities.write) return;
        const folder = folderOf(await provider.getTree());
        expect(
          folder,
          `the conformance seed needs a directory without an index page; ${SEED_HELP}`,
        ).toBeDefined();
        if (!folder) return;

        const result = await provider.savePage(folder.id, {
          body: '# Converted\n',
          baseVersion: null,
        });
        expect(result.version).not.toBe('');

        const after = await provider.getTree();
        const converted = after.nodes.find((node) => node.id === folder.id);
        expect(converted?.kind).toBe('page');
        expect((await provider.getPage(folder.id)).body).toContain('# Converted');
      });
    });

    describe('updateMeta', () => {
      it('writes title and icon without touching the body', async () => {
        const provider = await fresh();
        if (!provider.capabilities.write) return;
        const target = leafPageOf(await provider.getTree());
        if (!target) return;

        const before = await provider.getPage(target.id);
        const node = await provider.updateMeta(target.id, {
          title: 'Conformance title',
          icon: 'lucide:book-open',
        });

        expect(node.id).toBe(target.id);
        expect(node.title).toBe('Conformance title');
        expect(node.icon).toEqual({ kind: 'lucide', name: 'book-open' });

        const after = await provider.getPage(target.id);
        expect(after.body).toBe(before.body);
        expect(after.version).not.toBe(before.version);
      });
    });

    describe('create', () => {
      it('creates at the root', async () => {
        const provider = await fresh();
        if (!provider.capabilities.write) return;
        const created = await provider.createPage({
          parentId: null,
          title: 'Conformance root page',
        });

        expect(created.title).toBe('Conformance root page');
        expect(created.kind).toBe('page');
        expect((await provider.getPage(created.id)).body.trim()).toBe('');
        expect((await provider.getTree()).nodes.some((node) => node.id === created.id)).toBe(true);
      });

      it('creates under a folder, under a directory page and under a leaf page', async () => {
        const provider = await fresh();
        if (!provider.capabilities.write) return;
        const snapshot = await provider.getTree();

        const folder = folderOf(snapshot);
        if (folder) {
          const child = await provider.createPage({ parentId: folder.id, title: 'Under a folder' });
          expect(child.parentId).toBe(folder.id);
          expect(child.path.startsWith(`${folder.path}/`)).toBe(true);
        }

        const directoryPage = snapshot.nodes.find(
          (node) => node.kind === 'page' && isIndexPath(node.path) && node.childIds.length > 0,
        );
        if (directoryPage) {
          const child = await provider.createPage({
            parentId: directoryPage.id,
            title: 'Under a directory page',
          });
          expect(child.parentId).toBe(directoryPage.id);
        }

        const leaf = leafPageOf(await provider.getTree());
        expect(leaf, `the conformance seed needs a leaf page; ${SEED_HELP}`).toBeDefined();
        if (!leaf) return;

        const child = await provider.createPage({ parentId: leaf.id, title: 'Under a leaf page' });
        const after = await provider.getTree();
        const converted = after.nodes.find((node) => node.id === leaf.id);

        // docs/03 section 4.5: the leaf becomes a directory page and keeps its id.
        expect(converted, 'the converted leaf page lost its id').toBeDefined();
        expect(converted?.kind).toBe('page');
        expect(isIndexPath(converted?.path ?? '')).toBe(true);
        expect(child.parentId).toBe(leaf.id);
      });

      it('suffixes a title that would collide with an existing slug', async () => {
        const provider = await fresh();
        if (!provider.capabilities.write) return;

        const first = await provider.createPage({ parentId: null, title: 'Collision test' });
        const second = await provider.createPage({ parentId: null, title: 'Collision test' });

        expect(second.id).not.toBe(first.id);
        expect(second.path).not.toBe(first.path);
        expect(second.path).toMatch(/-2\.md$/);
      });
    });

    describe('move', () => {
      it('moves between parents, rewriting the path and keeping the id', async () => {
        const provider = await fresh();
        if (!provider.capabilities.move) return;

        const host = await provider.createPage({ parentId: null, title: 'Move target host' });
        await provider.createPage({ parentId: host.id, title: 'Anchor' });
        const traveller = await provider.createPage({ parentId: null, title: 'Traveller' });

        const moved = await provider.movePage(traveller.id, { parentId: host.id, index: 0 });

        expect(moved.id).toBe(traveller.id);
        expect(moved.parentId).toBe(host.id);
        expect(moved.path).not.toBe(traveller.path);
        expect(childrenOf(await provider.getTree(), host.id).map((node) => node.id)).toContain(
          traveller.id,
        );
      });

      it('refuses a move into its own subtree', async () => {
        const provider = await fresh();
        if (!provider.capabilities.move) return;

        const parent = await provider.createPage({ parentId: null, title: 'Cycle parent' });
        const child = await provider.createPage({ parentId: parent.id, title: 'Cycle child' });

        for (const target of [parent.id, child.id]) {
          await expect(
            provider.movePage(parent.id, { parentId: target, index: 0 }),
          ).rejects.toSatisfy(
            (error: unknown) => isProviderError(error) && error.code === 'validation',
          );
        }
        expect((await provider.getTree()).nodes.some((node) => node.id === child.id)).toBe(true);
      });

      it('reorders inside the same parent without changing the path', async () => {
        const provider = await fresh();
        if (!provider.capabilities.move) return;

        const host = await provider.createPage({ parentId: null, title: 'Reorder host' });
        const first = await provider.createPage({ parentId: host.id, title: 'Alpha', index: 0 });
        const second = await provider.createPage({ parentId: host.id, title: 'Beta', index: 1 });

        const moved = await provider.movePage(second.id, { parentId: host.id, index: 0 });
        expect(moved.path).toBe(second.path);

        const order = childrenOf(await provider.getTree(), host.id).map((node) => node.id);
        expect(order.indexOf(second.id)).toBeLessThan(order.indexOf(first.id));
      });

      it('keeps ordering usable after the midpoints run out', async () => {
        const provider = await fresh();
        if (!provider.capabilities.move) return;

        const host = await provider.createPage({ parentId: null, title: 'Precision host' });
        const low = await provider.createPage({ parentId: host.id, title: 'Low', index: 0 });
        await provider.createPage({ parentId: host.id, title: 'High', index: 1 });

        // Each insert at index 1 halves the gap; 26 of them exhaust the 1e-6 floor.
        const wedges: NodeId[] = [];
        for (let i = 0; i < 26; i++) {
          wedges.push(
            (
              await provider.createPage({
                parentId: host.id,
                title: `Wedge ${String(i)}`,
                index: 1,
              })
            ).id,
          );
        }

        const last = wedges[wedges.length - 1];
        expect(last).toBeDefined();
        if (last === undefined) return;

        // The renumber path runs here; afterwards the group must still be orderable.
        await provider.movePage(last, { parentId: host.id, index: 1 });
        const after = childrenOf(await provider.getTree(), host.id).map((node) => node.id);
        expect(after[0]).toBe(low.id);
        expect(after[1]).toBe(last);
        expect(new Set(after).size).toBe(after.length);

        await provider.movePage(last, { parentId: host.id, index: 3 });
        const final = childrenOf(await provider.getTree(), host.id).map((node) => node.id);
        expect(final.indexOf(last)).toBe(3);
      });
    });

    describe('delete', () => {
      it('removes the node and everything beneath it', async () => {
        const provider = await fresh();
        if (!provider.capabilities.delete) return;

        const parent = await provider.createPage({ parentId: null, title: 'Doomed parent' });
        const child = await provider.createPage({ parentId: parent.id, title: 'Doomed child' });
        const grandchild = await provider.createPage({
          parentId: child.id,
          title: 'Doomed grandchild',
        });

        await provider.deletePage(parent.id);

        const after = await provider.getTree();
        for (const id of [parent.id, child.id, grandchild.id]) {
          expect(
            after.nodes.some((node) => node.id === id),
            `${id} survived the delete`,
          ).toBe(false);
        }
        await expect(provider.getPage(parent.id)).rejects.toSatisfy(
          (error: unknown) => isProviderError(error) && error.code === 'not_found',
        );
      });
    });

    describe('assets', () => {
      it('refuses a path that climbs above the root', async () => {
        const provider = await fresh();
        const page = pagesOf(await provider.getTree())[0];
        if (!page) return;

        await expect(provider.assetUrl('../../../../etc/passwd', page)).rejects.toSatisfy(
          (error: unknown) => isProviderError(error) && error.code === 'validation',
        );
      });

      it('resolves a relative asset against the page directory', async () => {
        const provider = await fresh();
        if (!opts.asset) return;
        const page = nodeByPath(await provider.getTree(), opts.asset.pagePath);
        expect(page, `the conformance seed has no page at ${opts.asset.pagePath}`).toBeDefined();
        if (!page) return;

        const url = await provider.assetUrl(opts.asset.href, page);
        expect(url).not.toBe('');
        expect(await provider.assetUrl(opts.asset.href, page)).toBe(url);
      });

      it('hands an absolute URL back unchanged', async () => {
        const provider = await fresh();
        const page = pagesOf(await provider.getTree())[0];
        if (!page) return;
        const external = 'https://example.com/asset.png';
        expect(await provider.assetUrl(external, page)).toBe(external);
      });
    });

    describe('a provider that cannot write', () => {
      it('rejects every write with unsupported', async () => {
        const provider = await fresh();
        if (provider.capabilities.write) return;
        const page = pagesOf(await provider.getTree())[0];
        if (!page) return;

        for (const call of [
          (): Promise<unknown> => provider.savePage(page.id, { body: '', baseVersion: null }),
          (): Promise<unknown> => provider.updateMeta(page.id, { title: 'x' }),
          (): Promise<unknown> => provider.createPage({ parentId: null, title: 'x' }),
          (): Promise<unknown> => provider.movePage(page.id, { parentId: null, index: 0 }),
          (): Promise<unknown> => provider.deletePage(page.id),
        ]) {
          await expect(call()).rejects.toSatisfy(
            (error: unknown) => isProviderError(error) && error.code === 'unsupported',
          );
        }
      });
    });
  });
}
