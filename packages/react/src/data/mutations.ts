import {
  applyInsert,
  applyMeta,
  applyMove,
  applyRemove,
  buildIndex,
  flatten,
  isProviderError,
  parseIcon,
  subtreeIds,
  type NodeId,
  type PageDocument,
  type SaveResult,
  type PageMetaPatch,
  type TreeIndex,
  type TreeNode,
  type TreeSnapshot,
} from '@docs/core';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from '@/lib/toast.js';
import { resolvePersist } from './cache/persister.js';
import { useDocs } from './context.js';
import { draftStoreFor } from './drafts.js';
import { dropFresh, markFresh, namedFresh, settleFresh } from './fresh.js';
import { pageQuery } from './queries.js';
import { format } from './strings.js';
import { forgetPage } from './session.js';

/**
 * docs/04 section 4: every mutation patches the cache with the pure `apply*` from core before
 * the provider is called, rolls that patch back if the call fails, and invalidates the tree on
 * settle so paths, order and anything the provider derived come back from the source of truth.
 */

export interface UpdateMetaVariables {
  id: NodeId;
  patch: PageMetaPatch;
  /** docs/03 section 4.7: only a fresh page's first title commit takes the file with it. */
  renameFile?: boolean;
}

/** What the cache held before the patch, so `onError` can put it back. */
interface MetaContext {
  tree: TreeSnapshot | undefined;
  page: PageDocument | undefined;
}

/** The tree is cached as a snapshot and indexed on read, so the patch goes back the same way. */
function patchTree(snapshot: TreeSnapshot, id: NodeId, patch: PageMetaPatch): TreeSnapshot {
  const next = applyMeta(buildIndex(snapshot), id, nodePatch(patch));
  // An id the tree does not hold, or a patch that changes nothing: `applyMeta` returns the
  // same index, and a version that did not move keeps `useTreeIndex` on its memoized index.
  if (next.version === snapshot.version) return snapshot;
  return { version: next.version, nodes: snapshot.nodes.map((node) => next.byId[node.id] ?? node) };
}

/** Frontmatter carries the icon as a string; a tree node carries it parsed (docs/03 section 5). */
function nodePatch(patch: PageMetaPatch): Partial<TreeNode> {
  return {
    ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
    // `''` removes the icon, and `applyMeta` drops the key when the patch resolves to nothing.
    ...('icon' in patch ? { icon: parseIcon(patch.icon) } : {}),
  };
}

function patchPage(page: PageDocument, patch: PageMetaPatch): PageDocument {
  const meta = { ...page.meta, ...patch };
  if (patch.icon !== '') return { ...page, meta };
  const { icon: _icon, ...withoutIcon } = meta;
  return { ...page, meta: withoutIcon };
}

/**
 * Title and icon (docs/04 section 4). The open page and the tree row move together, so the
 * sidebar and the canvas never disagree while the write is in flight.
 */
export function useUpdateMeta(
  rootId?: NodeId,
): UseMutationResult<TreeNode, Error, UpdateMetaVariables, MetaContext> {
  const { keys, ns, onEvent, provider } = useDocs();
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch, renameFile }: UpdateMetaVariables): Promise<TreeNode> =>
      provider.updateMeta(id, patch, renameFile === true ? { renameFile: true } : undefined),
    onMutate: async ({ id, patch }): Promise<MetaContext> => {
      const tree = keys.tree(rootId);
      const page = keys.page(id);
      // An in-flight read would land after the patch and undo it.
      await Promise.all([
        client.cancelQueries({ queryKey: tree }),
        client.cancelQueries({ queryKey: page }),
      ]);
      const context: MetaContext = {
        tree: client.getQueryData<TreeSnapshot>(tree),
        page: client.getQueryData<PageDocument>(page),
      };
      if (context.tree !== undefined) client.setQueryData(tree, patchTree(context.tree, id, patch));
      if (context.page !== undefined) client.setQueryData(page, patchPage(context.page, patch));
      return context;
    },
    onError: (error, { id }, context) => {
      if (context?.tree !== undefined) client.setQueryData(keys.tree(rootId), context.tree);
      if (context?.page !== undefined) client.setQueryData(keys.page(id), context.page);
      onEvent({ type: 'error', code: isProviderError(error) ? error.code : 'internal', id, error });
    },
    onSuccess: (_node, { id, patch, renameFile }) => {
      // Only now: a rename that failed leaves the file `untitled*.md`, so the next title still
      // has to take it with it (docs/03 section 4.7).
      if (renameFile === true) namedFresh(ns, id);
      if ('title' in patch) onEvent({ type: 'page:renamed', id });
    },
    onSettled: (_node, _error, { id }) => {
      void client.invalidateQueries({ queryKey: keys.tree(rootId) });
      // The title and the icon live in the file's frontmatter, so this wrote the file: until
      // the page is read again, the session is holding a version that no longer exists and
      // its next save is rejected as a stale base (docs/04 section 3.2). The module's own
      // first-title rename lands while the page it renames is being typed into.
      void client.invalidateQueries({ queryKey: keys.page(id) });
    },
  });
}

export interface CreatePageVariables {
  parentId: NodeId | null;
  /** `''` opens the page on its placeholder title; the palette passes what was typed. */
  title: string;
  /** The id the row is inserted under until the provider answers (docs/01 section 5.3). */
  tempId: NodeId;
}

/** The tree before the insert, plus the page to go back to if the provider refuses. */
interface CreateContext {
  tree: TreeSnapshot | undefined;
  from: NodeId | null;
}

/** The cache holds snapshots and the pure `apply*` work on an index, so the patch goes back. */
function toSnapshot(index: TreeIndex): TreeSnapshot {
  return {
    version: index.version,
    nodes: flatten(index)
      .map((id) => index.byId[id])
      .filter((node): node is TreeNode => node !== undefined),
  };
}

/**
 * docs/04 section 4. The row and the page appear under a temporary id and the editor opens on
 * them; when the provider answers, the same page carries on under the id it gave.
 *
 * The navigation is the mutation's own rather than the caller's, because the order is the whole
 * point: the cache patch and the navigation to the temporary id have to land in one tick, or
 * the shell renders "this page no longer exists" on the way there.
 */
export function useCreatePage(
  rootId?: NodeId,
): UseMutationResult<TreeNode, Error, CreatePageVariables, CreateContext> {
  const { keys, navigation, ns, onEvent, provider, strings } = useDocs();
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ parentId, title }: CreatePageVariables): Promise<TreeNode> =>
      provider.createPage({ parentId, title }),

    onMutate: async ({ parentId, title, tempId }): Promise<CreateContext> => {
      const tree = keys.tree(rootId);
      await client.cancelQueries({ queryKey: tree });
      const context: CreateContext = {
        tree: client.getQueryData<TreeSnapshot>(tree),
        from: navigation.activePageId,
      };

      const index = context.tree === undefined ? undefined : buildIndex(context.tree);
      const parent = parentId === null ? undefined : index?.byId[parentId];
      const node: TreeNode = {
        id: tempId,
        kind: 'page',
        title: title === '' ? strings['empty.page.title'] : title,
        // The provider picks the slug, so until it answers this page is at no path at all and
        // nothing resolves a link to it (docs/03 section 4.7).
        path: '',
        parentId: parent === undefined ? null : parentId,
        childIds: [],
      };
      if (index !== undefined) {
        const at = parent === undefined ? index.rootIds.length : parent.childIds.length;
        client.setQueryData(tree, toSnapshot(applyInsert(index, node, node.parentId, at)));
      }
      client.setQueryData(keys.page(tempId), emptyPage(tempId, title));
      markFresh(ns, tempId);

      // docs/01 section 5.3: edit mode with the title focused, which `PageTitle` reads off the
      // fresh flag. A real history entry: the new page is somewhere the back button returns from.
      navigation.navigate({ pageId: tempId, mode: 'edit' });
      return context;
    },

    onSuccess: async (node, { tempId }) => {
      // Fetched before anything navigates onto it, so the session that is already open adopts a
      // version the provider knows and the swap paints nothing. A read that fails changes
      // nothing about the page having been created: the canvas fetches it again on the way in.
      await client.query(pageQuery(provider, keys, node.id)).catch(() => undefined);
      // Before the patch below, because that patch notifies: the render it causes is the first
      // one that has to know the two ids are the same page (docs/04 section 4).
      settleFresh(ns, tempId, node.id);
      const snapshot = client.getQueryData<TreeSnapshot>(keys.tree(rootId));
      if (snapshot !== undefined) {
        const index = applyRemove(buildIndex(snapshot), tempId);
        const parent = node.parentId === null ? undefined : index.byId[node.parentId];
        const at = parent === undefined ? index.rootIds.length : parent.childIds.length;
        client.setQueryData(
          keys.tree(rootId),
          toSnapshot(applyInsert(index, node, node.parentId, at)),
        );
      }
      onEvent({ type: 'page:created', id: node.id });
      // Replaces the temporary id in the host's history rather than stacking a second entry.
      navigation.navigate({ pageId: node.id, mode: 'edit' }, { replace: true });
    },

    onError: (error, { tempId }, context) => {
      dropFresh(ns, tempId);
      if (context?.tree !== undefined) client.setQueryData(keys.tree(rootId), context.tree);
      navigation.navigate({ pageId: context?.from ?? null, mode: 'read' }, { replace: true });
      const code = isProviderError(error) ? error.code : 'internal';
      onEvent({ type: 'error', code, id: tempId, error });
    },

    onSettled: (_node, _error, { tempId }) => {
      // After the navigation above, so nothing is left observing a page that never existed.
      client.removeQueries({ queryKey: keys.page(tempId) });
      void client.invalidateQueries({ queryKey: keys.tree(rootId) });
    },
  });
}

export interface MovePageVariables {
  id: NodeId;
  parentId: NodeId | null;
  /** Where among the new parent's children it lands, counted with the moved node removed. */
  index: number;
}

/** The tree as it was before the drop, so a refusal puts the row back where it came from. */
interface MoveContext {
  tree: TreeSnapshot | undefined;
}

/**
 * docs/04 section 4: the row moves on the drop and the provider is told afterwards. Paths stay
 * stale until the settle invalidation brings them back - `applyMove` moves ids, and ids are
 * what the tree draws from (docs/03 section 4.2).
 */
export function useMovePage(
  rootId?: NodeId,
): UseMutationResult<TreeNode, Error, MovePageVariables, MoveContext> {
  const { keys, onEvent, provider } = useDocs();
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, parentId, index }: MovePageVariables): Promise<TreeNode> =>
      provider.movePage(id, { parentId, index }),

    onMutate: async ({ id, parentId, index }): Promise<MoveContext> => {
      const tree = keys.tree(rootId);
      await client.cancelQueries({ queryKey: tree });
      const context: MoveContext = { tree: client.getQueryData<TreeSnapshot>(tree) };
      if (context.tree !== undefined) {
        const next = applyMove(buildIndex(context.tree), id, parentId, index);
        client.setQueryData(tree, toSnapshot(next));
      }
      return context;
    },

    onSuccess: (_node, { id }) => {
      onEvent({ type: 'page:moved', id });
      // docs/03 section 4.4: the move ran out of midpoints and rewrote the siblings.
      const count = provider.takeRenumbered?.() ?? 0;
      if (count > 0) onEvent({ type: 'tree:renumbered', count });
    },

    onError: (error, { id }, context) => {
      if (context?.tree !== undefined) client.setQueryData(keys.tree(rootId), context.tree);
      const code = isProviderError(error) ? error.code : 'internal';
      onEvent({ type: 'error', code, id, error });
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.tree(rootId) });
    },
  });
}

export interface DeletePageVariables {
  id: NodeId;
}

/** The tree as it was, the ids that went with the row, and the page that was open. */
interface DeleteContext {
  tree: TreeSnapshot | undefined;
  ids: readonly NodeId[];
  /** The title the toasts name, taken while the node was still in the tree. */
  title?: string;
  /** Set only when the delete navigated off the open page, and then it is where from. */
  from?: NodeId | null;
}

/**
 * docs/04 section 4: the row goes on confirm and the provider is told afterwards. What the
 * subtree left in the caches goes with it once the provider agrees - page queries, L3 values,
 * L4 drafts and save status - because a failed delete has to be able to put all of it back.
 */
export function useDeletePage(
  rootId?: NodeId,
): UseMutationResult<void, Error, DeletePageVariables, DeleteContext> {
  const { keys, navigation, ns, onEvent, options, provider, strings } = useDocs();
  const client = useQueryClient();
  const drafts = useMemo(
    () => draftStoreFor({ ns, enabled: resolvePersist(options.persist).drafts }),
    [ns, options.persist],
  );

  return useMutation({
    mutationFn: ({ id }: DeletePageVariables): Promise<void> => provider.deletePage(id),

    onMutate: async ({ id }): Promise<DeleteContext> => {
      const tree = keys.tree(rootId);
      await client.cancelQueries({ queryKey: tree });
      const snapshot = client.getQueryData<TreeSnapshot>(tree);
      if (snapshot === undefined) return { tree: undefined, ids: [id] };
      const index = buildIndex(snapshot);
      // Taken before the patch: after it the subtree is no longer in the tree to be walked.
      const context: DeleteContext = {
        tree: snapshot,
        ids: subtreeIds(index, id),
        title: index.byId[id]?.title,
      };
      const open = navigation.activePageId;
      client.setQueryData(tree, toSnapshot(applyRemove(index, id)));

      // docs/04 section 4: a page that is going cannot stay open. The parent is the nearest
      // page still there; a root page leaves nothing above it, so that is home. `replace`,
      // because the entry it swaps is one the back button would return to a deleted page from.
      if (open !== null && context.ids.includes(open)) {
        context.from = open;
        navigation.navigate({ pageId: index.byId[id]?.parentId ?? null }, { replace: true });
      }
      return context;
    },

    onSuccess: (_void, { id }, context) => {
      for (const gone of context.ids) {
        client.removeQueries({ queryKey: keys.page(gone) });
        forgetPage(ns, gone, drafts);
      }
      onEvent({ type: 'page:deleted', id });
      // docs/07 section 10: said here rather than at the call site, because deleting the open
      // page unmounts whatever asked for it - the page menu goes with the page.
      toast(format(strings['menu.deleted'], { title: context.title ?? '' }));
    },

    onError: (error, { id }, context) => {
      if (context?.tree !== undefined) client.setQueryData(keys.tree(rootId), context.tree);
      // The page is still there, so leaving the reader on its parent would be half a delete:
      // the row comes back, and the page it belongs to is one the reader was thrown out of.
      if (context?.from !== undefined) {
        navigation.navigate({ pageId: context.from }, { replace: true });
      }
      const code = isProviderError(error) ? error.code : 'internal';
      onEvent({ type: 'error', code, id, error });
      toast(format(strings['error.delete'], { title: context?.title ?? '' }));
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.tree(rootId) });
    },
  });
}

export interface SavePageVariables {
  id: NodeId;
  body: string;
  /**
   * The version the body was edited from, and `null` for a page that has no file yet - which
   * is what turns a folder into the page of the same name, id and all (docs/03 section 4.1).
   */
  baseVersion: string | null;
}

/**
 * The one-shot save, for a write that no editor session is behind: the open page saves through
 * `useDocumentSession` instead (docs/04 section 3), which owns the drafts, the retries and the
 * conflict decision this has none of.
 */
export function useSavePage(
  rootId?: NodeId,
): UseMutationResult<SaveResult, Error, SavePageVariables> {
  const { keys, onEvent, provider } = useDocs();
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body, baseVersion }: SavePageVariables): Promise<SaveResult> =>
      provider.savePage(id, { body, baseVersion }),

    onSuccess: (_result, { id, baseVersion }) => {
      // A save off a null base is a page that did not exist a moment ago, whatever the tree
      // called the node before it (docs/03 section 10). A save off a version is the editor's
      // business, and `page:saved` carries numbers only the session has.
      if (baseVersion === null) onEvent({ type: 'page:created', id });
      void client.invalidateQueries({ queryKey: keys.page(id) });
      void client.invalidateQueries({ queryKey: keys.tree(rootId) });
    },

    onError: (error, { id }) => {
      const code = isProviderError(error) ? error.code : 'internal';
      onEvent({ type: 'error', code, id, error });
    },
  });
}

/** What the editor opens on while the provider is still writing the file. */
function emptyPage(id: NodeId, title: string): PageDocument {
  return {
    id,
    // Held even when it is empty: the row needs a placeholder title to read as a row, but the
    // title field has to open on its own placeholder so the first keystroke names the page.
    meta: { id, title },
    body: '',
    // No file, so no hash yet: the real version arrives with the provider's answer.
    version: '',
    updatedAt: new Date().toISOString(),
  };
}
