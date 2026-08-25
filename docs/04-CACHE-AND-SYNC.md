# 04. Cache and Sync

Goal: the app feels local. Pages paint from cache before the network or filesystem answers; edits are never lost; the file on disk is never overwritten silently.

## 1. Layers

| Layer | Technology | Key | Holds | Lifetime |
|---|---|---|---|---|
| L1 Query cache | TanStack Query v5 in memory | `[ns,'meta']`, `[ns,'tree',rootId]`, `[ns,'page',id]` | `BackendMeta`, `TreeIndex`, `PageDocument` | `staleTime` meta ∞ / tree 30 s / page 5 min; `gcTime` 24 h / 24 h / 30 min |
| L2 Persisted queries | `experimental_createQueryPersister` from `@tanstack/query-persist-client-core` with an `idb-keyval` `AsyncStorage` | `ns:q:<hash>` in IndexedDB store `docs-queries` | serialized `tree` and `page` queries (not `meta`, not search) | `maxAge` 7 days; `buster = CACHE_SCHEMA_VERSION + ':' + CONTRACT_VERSION` |
| L3 Value cache | in-memory LRU (20 entries) | `ns:id:version` | parsed Plate `Value` + `Fidelity` | until evicted |
| L4 Draft store | `idb-keyval` store `docs-drafts` | `ns:d:<pageId>` | `{ body, baseVersion, updatedAt, selection? }` | until saved or discarded |
| L5 Preferences | localStorage via Zustand persist | `ns:sidebar` | collapsed, width, expanded record, lastOpenedPageId | forever |
| L6 Recents | localStorage | `ns:recents` | last 12 page ids with timestamps | forever |
| L7 Index cache | IndexedDB store `docs-index` | `ns:index` | per-path `{ size, mtime, meta, firstH1 }` for filesystem stores | until schema change |

`ns` is defined in docs/02 section 6. Persisting per query (L2) rather than the whole client means only pages that were actually opened are stored, restore is lazy per query, and the tree restores in one read.

## 2. Read path

1. `usePage(id)` subscribes to `[ns,'page',id]` with `persister` set. On a cold client the persister restores the query from IndexedDB before running `queryFn` if the entry is fresh enough; the UI paints immediately from restored data (`isRestoring` state shows the skeleton only when nothing is persisted).
2. `queryFn` calls `provider.getPage(id)`. Result replaces the cached document when `version` differs.
3. `markdownToValue` runs through L3. Same version → same `Value` object identity, so the editor does not re-parse.
4. The tree query follows the same pattern with `rootId` in the key.

Revalidation triggers: mount when stale, window focus, reconnect, `provider.subscribe` events, and after any mutation on the tree. Silent: no spinner on refetch of data that is already displayed.

## 3. Write path: `useDocumentSession(page)`

One session per open page, keyed `ns:pageId`, stored in the Zustand session store so the header, sidebar, and `beforeunload` guard can read status after the editor unmounts.

```ts
export type SessionStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'offline' | 'error' | 'draft';

export interface DocumentSession {
  value: Value;                 // initial value for the editor (from L3, or the draft when restored)
  fidelity: Fidelity;
  status: SessionStatus;
  draftRestored: boolean;
  onChange(value: Value): void;                 // called by Plate; stores latest value in a ref; marks dirty; schedules draft + save
  flush(): Promise<void>;                       // serialize + save now (Cmd+S, blur, hide, navigate, unmount)
  discard(): void;                              // drop local changes, clear draft, reset editor to cached document
  resolveConflict(choice: 'reload' | 'overwrite'): Promise<void>;
  resolveDraft(choice: 'keep' | 'discard'): void;
}
```

### 3.1 Timers
- Draft: 500 ms after the last change, `valueToMarkdown` in `requestIdleCallback` (fallback `setTimeout 0`), write L4. Cheap enough at 3k blocks (measured in the perf fixture; if serialize exceeds 30 ms on the 3k fixture, switch draft to 1 s).
- Save: 1.5 s after the last change. Both timers reset on every change.
- Flush events: editor blur (only if the focus left the editor root, not moved to a toolbar), `visibilitychange` hidden, `pagehide`, navigation away (`DocsNavigation` change), unmount, `Cmd+S`.

### 3.2 State machine

```
clean ──change──► dirty ──1.5 s idle / flush──► saving ──200──► saved ──1.5 s──► clean
  ▲                                                │ 409 ──► conflict ──reload──► clean (refetch)
  │                                                │            └──overwrite──► saving (baseVersion = currentVersion)
  │                                                │ network ──► offline ──retry ok──► saved
  │                                                └ other ──► error (toast, stays dirty, guard on)
  └──── page query refreshed with a new version while clean: editor.tf.setValue(newValue), stay clean
       page query refreshed with a new version while dirty: conflict (cache untouched)
```

- `saved` is a transient state only used to show the brief "Saved" affordance in the status tooltip; it is not rendered as a permanent label (D-24).
- Every successful save: `setQueryData(page, { body, version, updatedAt })`, `setQueryData(tree, applyMeta(id, { updatedAt }))`, `lastSavedVersion = version`, delete L4 draft. No refetch.
- The session never saves if the editor value equals the initial parsed value (deep-equal short circuit) and the page was never marked dirty. Unedited pages produce zero writes, including `lossy` ones.

### 3.3 Draft restore on open
1. Read L4 for `pageId`.
2. No draft → normal open.
3. Draft with `baseVersion === page.version` → parse draft body as the initial value, `status = 'draft'`, `draftRestored = true`, banner "Restored unsaved changes" with Keep (stays dirty, saves on the usual timer) and Discard.
4. Draft with a different base → banner "This page changed since your unsaved edits" with Apply draft (opens in edit mode with the draft, base = current version, saving overwrites) and Keep file (deletes the draft). P3 optional: Compare (text diff dialog).

### 3.4 Offline and retry
- `useOnline`: `navigator.onLine` plus the last provider error. Any `network` error moves the session to `offline`.
- Retry schedule for saves: 1 s, 2 s, 4 s, 8 s, 16 s, 30 s, then every 30 s, plus immediately on `online` event and on window focus. Retries reuse the latest value, not the value at failure time.
- Reads while offline: served from L1/L2; a missing page shows "Not available offline" with Retry.
- Structural mutations while offline: buttons disabled, tooltip "Reconnect to change pages" (D-05).

### 3.5 Conflicts
- Detected by the provider (`ConflictError`) or by a refresh with a new version while dirty.
- Banner (role `alert`): "Changed on disk since you opened it." Buttons: Reload (discards local edits: refetch, clear draft, exit edit mode), Overwrite (`baseVersion = currentVersion`, save). No third silent path. The draft stays in L4 until the user chooses.

## 4. Mutations and the tree

| Mutation | Optimistic patch (pure `apply*` from core) | On success | On error |
|---|---|---|---|
| createPage | `applyInsert` with a temp id `tmp_<ulid>` titled "Untitled"; the shell opens the temp page in edit mode with the title focused (a local empty `PageDocument` is seeded into the page query for the temp id) | replace the temp id with the real node in the tree and re-key the open page query and session to the real id without remounting the editor; `invalidateQueries(tree)`; the page is marked fresh so the first title commit passes `renameFile` | `applyRemove(temp)`; navigate back; toast |
| updateMeta (title, icon) | `applyMeta`; also patch open page `meta` | `invalidateQueries(tree)` on settle | rollback from `onMutate` context |
| movePage | `applyMove` (paths stale until refetch) | `invalidateQueries(tree)` (paths and order come back) | rollback |
| deletePage | `applyRemove`; if the open page is inside the subtree, navigate to parent or home | remove page queries, L3 entries, L4 drafts for the subtree; `invalidateQueries(tree)` | rollback |
| savePage | none (content lives in the editor) | see 3.2 | see 3.2 |

Tree refetch after a mutation is the only refetch the module triggers on its own.

## 5. Subscriptions and echo suppression
`provider.subscribe` events: `tree` → `invalidateQueries(tree)`; `page` → invalidate that page unless `version === session.lastSavedVersion` (prevents save → watcher → refetch loops). The filesystem adapter emits events by polling `stat` on the open page every 5 s and the tree every 30 s when `subscribe: true` is requested (cheap: mtime only).

## 6. Storage failures
- IndexedDB unavailable (private mode, quota, `SecurityError`): L2, L4, L7 degrade to in-memory implementations behind the same interface; `onEvent({ type: 'warning', code: 'storage_unavailable' })` once per session; the status tooltip notes "Drafts are not persisted in this browser".
- Quota exceeded during a draft write: drop the oldest drafts of other pages, retry once, then degrade as above.
- Persisted entries from another schema version are ignored by the `buster` and garbage collected by `persisterGc()` on startup (after first paint, in idle time).

## 7. Cache keys (`packages/react/src/data/keys.ts`)

```ts
export const createKeys = (ns: string) => ({
  all: [ns] as const,
  meta: [ns, 'meta'] as const,
  tree: (rootId?: NodeId) => [ns, 'tree', rootId ?? '*'] as const,
  page: (id: NodeId) => [ns, 'page', id] as const,
  search: (q: string) => [ns, 'search', q] as const,
});
```

`DocsProvider` computes `ns` once from `instanceId` and `provider.key`; changing either remounts the subtree (React `key`), which guarantees a clean cache boundary when the playground switches folders.

## 8. Host `QueryClient` sharing
If the host passes `queryClient`, the module uses it and sets its persister per query (never globally). Otherwise it creates an internal client with `defaultOptions.queries.retry = 1` for reads and `retry = false` for mutations (the session owns save retries).
