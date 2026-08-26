import {
  classifyFidelity,
  isConflictError,
  isProviderError,
  type Fidelity,
  type NodeId,
  type PageDocument,
  type SaveResult,
  type TreeSnapshot,
} from '@docs/core';
import { useQueryClient } from '@tanstack/react-query';
import type { Value } from 'platejs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { cancelIdle, requestIdle } from '@/lib/idle.js';
import { sameValue } from '@/lib/same-value.js';
import { createLru, valueCache, valueCacheKey, type Lru } from './cache/value-cache.js';
import { resolvePersist } from './cache/persister.js';
import { useCodec } from './codec.js';
import { useDocs } from './context.js';
import { draftStoreFor, type Draft, type DraftStore } from './drafts.js';
import { isTempId } from './fresh.js';
import { usePageValue } from './use-page-value.js';
import {
  cleanSession,
  hasUnsavedWork,
  sessionStoreFor,
  useSessionState,
  type SessionState,
  type SessionStatus,
} from './session-store.js';

/** docs/04 section 3.1. Both timers restart on every change. */
/**
 * docs/04 section 3.1: 500 ms after the last change, unless serializing the 3k-block fixture
 * costs more than 30 ms. It costs 38 (ASM-150), so this is the 1 s that clause names instead.
 */
const DRAFT_MS = 1000;
const SAVE_MS = 1500;
/** How long the transient "Saved" state stays up before the header goes quiet again (D-24). */
const SAVED_MS = 1500;
/** docs/04 section 3.4, then every 30 s. */
const RETRY_MS = [1000, 2000, 4000, 8000, 16_000, 30_000];

/**
 * What the session needs from the editor it drives. Structural on purpose: every external reset
 * goes through `editor.tf.setValue` (docs/08 section 5), and this file may not import
 * `platejs/react`, which belongs to the editor chunk.
 */
export interface SessionEditor {
  /** What the editor holds now, which is what it will hand back on the next change. */
  children: Value;
  history: { redos: unknown[]; undos: unknown[] };
  tf: { setValue: (value?: Value) => void };
}

/** docs/04 section 3. */
export interface DocumentSession {
  /** The value the editor mounts with: the page, or the draft when one was restored. */
  value: Value;
  /** Computed on first read and cached per version: the lossy banner is the only caller. */
  readonly fidelity: Fidelity;
  status: SessionStatus;
  draftRestored: boolean;
  /** The editor instance from `onReady`. The session owns the ref (docs/08 section 5). */
  bind: (editor: SessionEditor) => void;
  onChange: (value: Value) => void;
  flush: () => Promise<void>;
  discard: () => void;
  resolveConflict: (choice: 'reload' | 'overwrite') => Promise<void>;
  resolveDraft: (choice: 'keep' | 'discard') => void;
  /**
   * The two texts behind the mismatch banner: the file as it is now and the waiting draft, or
   * `null` when nothing is waiting. Read on demand - the bodies are the size of a page, and the
   * compare dialog is the only thing that ever wants them.
   */
  compareDraft: () => { file: string; draft: string } | null;
}

const fidelityCache: Lru<Fidelity> = createLru<Fidelity>();

interface Timers {
  draft?: number;
  idle?: number;
  save?: number;
  saved?: number;
  retry?: number;
}

/** Everything the timers and callbacks read. Refs, so typing never re-renders the shell. */
interface Live {
  editor: SessionEditor | null;
  /** The latest value Plate handed over. */
  value: Value;
  /** The last value that reached the store, for the deep-equal short circuit. */
  baseline: Value;
  /** The version this edit started from; what `savePage` is called with. */
  base: string | null;
  /** The markdown on disk at `base`, so a version that only moved the frontmatter is known. */
  body: string;
  /** The version currently reflected in the editor, so our own saves are not read as refreshes. */
  seen: string;
  dirty: boolean;
  saving: Promise<void> | null;
  attempt: number;
  /** A draft written against another version, waiting for the mismatch banner's answer. */
  pendingDraft: Draft | null;
  timers: Timers;
}

/**
 * The open sessions by `ns:id`. `SaveStatus` sits in the header, outside the page it reports
 * on (docs/06 section 9), and its Unsaved changes and Couldn't save states save on click.
 */
const flushes = new Map<string, () => Promise<void>>();

/** Saves page `id` now, if it is open. A no-op for a page nothing is editing. */
export function flushSession(ns: string, id: NodeId): void {
  void flushes.get(`${ns}:${id}`)?.();
}

/** Called by the hook for as long as the page is open. Returns the way to take it back. */
export function registerSession(ns: string, id: NodeId, flush: () => Promise<void>): () => void {
  const key = `${ns}:${id}`;
  flushes.set(key, flush);
  return () => {
    flushes.delete(key);
  };
}

/**
 * docs/04 section 4: everything a deleted page leaves behind. The parsed value and its fidelity
 * are keyed by version, so both go by prefix; the draft and the save status go by id. The draft
 * store is the caller's, because whether drafts are stored at all is the host's option.
 */
export function forgetPage(ns: string, id: NodeId, drafts: DraftStore): void {
  const prefix = valueCacheKey(ns, id, '');
  valueCache.deletePrefix(prefix);
  fidelityCache.deletePrefix(prefix);
  sessionStoreFor(ns).getState().reset(id);
  void drafts.remove(id);
}

/**
 * The write path (docs/04 section 3): one session per open page, driving the draft and save
 * timers, the retry schedule, the conflict and draft decisions, and the `beforeunload` guard.
 * Status lives in the namespace's session store, which outlives this hook, so the header and
 * the sidebar can still read it after the editor unmounts.
 */
export function useDocumentSession(page: PageDocument): DocumentSession {
  const { keys, ns, onEvent, options, provider } = useDocs();
  const codec = useCodec();
  const client = useQueryClient();
  const initial = usePageValue(page);
  const id = page.id;

  const store = useMemo(() => sessionStoreFor(ns), [ns]);
  const state: SessionState = useSessionState(ns, id) ?? cleanSession;

  const drafts = useMemo(
    () =>
      draftStoreFor({
        ns,
        enabled: resolvePersist(options.persist).drafts,
        onUnavailable: () => {
          onEvent({ type: 'warning', code: 'storage_unavailable' });
        },
      }),
    [ns, options.persist, onEvent],
  );

  const live = useRef<Live>({
    editor: null,
    value: initial,
    baseline: initial,
    base: page.version,
    body: page.body,
    seen: page.version,
    dirty: false,
    saving: null,
    attempt: 0,
    pendingDraft: null,
    timers: {},
  });

  // Callbacks are built once and read the current props here, so nothing the shell passes can
  // leave a timer holding last render's page.
  const now = useRef({ codec, id, initial, page, provider, onEvent, keys, client, drafts, store });
  now.current = { codec, id, initial, page, provider, onEvent, keys, client, drafts, store };

  const api = useMemo(() => createSession(live, now, ns), [ns]);

  // docs/04 section 4: a page created in this session swaps its temporary id for the provider's
  // while the editor stays mounted. Everything the session holds is the user's and carries over;
  // only the id it saves under and the version it saves against are new. A layout effect, so it
  // lands before the passive effects below re-register and re-read against the new id.
  const previousId = useRef(id);
  useLayoutEffect(() => {
    const from = previousId.current;
    previousId.current = id;
    if (from !== id && isTempId(from)) api.rekey(from, page.version);
  }, [api, id, page.version]);

  // A new namespace re-keys the whole provider, so this only unmounts with the page: flush what
  // the user typed, then let the timers go (docs/04 section 3.1, "unmount").
  // The registration is what lets the status pill, which renders outside this page, save now.
  useEffect(() => {
    const session = api;
    const registered = registerSession(ns, id, session.flush);
    return () => {
      registered();
      void session.flush();
      session.stop();
    };
  }, [api, id, ns]);

  // docs/04 section 3.3: the draft for this page decides how it opens. The read is async, so it
  // can land after the editor has mounted; `apply` goes through the same reset path either way.
  useEffect(() => {
    let cancelled = false;
    void drafts.read(id).then((draft) => {
      if (!cancelled && draft !== null) api.restore(draft);
    });
    return () => {
      cancelled = true;
    };
  }, [api, drafts, id]);

  // docs/04 section 3.2: a page that changed on disk while the session was clean swaps in
  // silently; one that changed while the user was typing is a conflict, and the cache is left
  // alone so the banner can offer both ways out.
  useEffect(() => {
    api.refreshed(page.version, page.body, initial);
  }, [api, page.version, page.body, initial]);

  useEffect(() => api.listen(options.guardUnload), [api, options.guardUnload]);

  const fidelity = useCallback(
    () =>
      fidelityCache.getOrCreate(valueCacheKey(ns, id, page.version), () =>
        classifyFidelity(page.body, initial, codec),
      ),
    [codec, id, initial, ns, page.body, page.version],
  );

  return useMemo(
    () => ({
      value: initial,
      get fidelity(): Fidelity {
        return fidelity();
      },
      status: state.status,
      draftRestored: state.draftRestored,
      bind: api.bind,
      onChange: api.onChange,
      flush: api.flush,
      discard: api.discard,
      resolveConflict: api.resolveConflict,
      resolveDraft: api.resolveDraft,
      compareDraft: api.compareDraft,
    }),
    [api, fidelity, initial, state.draftRestored, state.status],
  );
}

type Now = React.RefObject<{
  codec: ReturnType<typeof useCodec>;
  id: NodeId;
  initial: Value;
  page: PageDocument;
  provider: ReturnType<typeof useDocs>['provider'];
  onEvent: ReturnType<typeof useDocs>['onEvent'];
  keys: ReturnType<typeof useDocs>['keys'];
  client: ReturnType<typeof useQueryClient>;
  drafts: DraftStore;
  store: ReturnType<typeof sessionStoreFor>;
}>;

/**
 * The session itself, outside React: one object per open page, holding the timers and the
 * transitions of docs/04 section 3.2. It reads props through `now` and state through `live`,
 * so a timer that fires three renders later still acts on the page in front of the user.
 */
function createSession(live: React.RefObject<Live>, now: Now, ns: string) {
  const patch = (next: Partial<SessionState>): void => {
    now.current.store.getState().patch(now.current.id, next);
  };
  const status = (): SessionStatus =>
    now.current.store.getState().sessions[now.current.id]?.status ?? 'clean';

  const clear = (...names: (keyof Timers)[]): void => {
    for (const name of names) {
      const handle = live.current.timers[name];
      if (handle === undefined) continue;
      live.current.timers[name] = undefined;
      if (name === 'idle') cancelIdle(handle);
      else clearTimeout(handle);
    }
  };

  /** Serialize on an idle callback: at 3k blocks this must not compete with the next keystroke. */
  const writeDraft = (): void => {
    clear('idle');
    live.current.timers.idle = requestIdle(() => {
      const { codec, drafts, id } = now.current;
      const body = codec.toMarkdown(live.current.value);
      void drafts.write(id, { body, baseVersion: live.current.base, updatedAt: Date.now() });
    }, 0);
  };

  const arm = (): void => {
    clear('draft', 'save', 'retry');
    live.current.timers.draft = window.setTimeout(writeDraft, DRAFT_MS);
    live.current.timers.save = window.setTimeout(() => void save(), SAVE_MS);
    patch({ pending: true });
  };

  const succeeded = (body: string, sent: Value, result: SaveResult, started: number): void => {
    const { client, id, keys, onEvent } = now.current;
    live.current.base = result.version;
    live.current.body = body;
    live.current.baseline = sent;
    live.current.seen = result.version;
    live.current.attempt = 0;
    live.current.dirty = live.current.value !== sent;

    // The bytes just saved are the bytes of the value in the editor: seed L3 under the new
    // version so the next mode swap reuses it instead of parsing what it already has.
    valueCache.set(valueCacheKey(ns, id, result.version), sent);
    client.setQueryData<PageDocument>(keys.page(id), (previous) =>
      previous === undefined
        ? previous
        : { ...previous, body, version: result.version, updatedAt: result.updatedAt },
    );
    touchTree(client, keys, id, result);
    void now.current.drafts.remove(id);

    onEvent({
      type: 'page:saved',
      id,
      version: result.version,
      bytes: new TextEncoder().encode(body).length,
      ms: Date.now() - started,
    });

    const saved = Date.parse(result.updatedAt);
    patch({
      status: live.current.dirty ? 'dirty' : 'saved',
      lastSavedAt: Number.isNaN(saved) ? Date.now() : saved,
      lastSavedVersion: result.version,
      retryAt: null,
      error: null,
      draftRestored: false,
      draftMismatch: false,
      draftAt: null,
      pending: false,
    });

    if (live.current.dirty) arm();
    else
      live.current.timers.saved = window.setTimeout(() => {
        patch({ status: 'clean' });
      }, SAVED_MS);
  };

  const failed = (error: unknown): void => {
    const { id, onEvent } = now.current;
    if (isConflictError(error)) {
      patch({ status: 'conflict', error, pending: false });
      onEvent({ type: 'page:conflict', id });
      return;
    }
    // A browser that went offline mid-flight reports the abort as any of a dozen errors; the
    // provider's `network` code and `navigator.onLine` are the two honest signals.
    const code = isProviderError(error) ? error.code : 'internal';
    if (code === 'network' || !navigator.onLine) {
      const delay = RETRY_MS[Math.min(live.current.attempt, RETRY_MS.length - 1)] ?? 30_000;
      live.current.attempt += 1;
      live.current.timers.retry = window.setTimeout(() => void save(), delay);
      patch({ status: 'offline', error, retryAt: Date.now() + delay, pending: true });
      return;
    }
    patch({ status: 'error', error, pending: false });
    onEvent({ type: 'error', code, id, error });
  };

  const save = async (): Promise<void> => {
    clear('draft', 'save', 'retry');
    if (live.current.saving !== null) return live.current.saving;
    if (!live.current.dirty || status() === 'conflict') {
      patch({ pending: false });
      return;
    }

    const { codec, id, provider } = now.current;
    const sent = live.current.value;
    // docs/10 section 5 budgets the round trip as serialize plus write, so the clock the
    // `page:saved` event reports starts here rather than after the Markdown is in hand.
    const started = Date.now();
    const body = codec.toMarkdown(sent);
    const base = live.current.base;
    patch({ status: 'saving', pending: false });

    const run = provider
      .savePage(id, { body, baseVersion: base })
      .then((result) => {
        succeeded(body, sent, result, started);
      })
      .catch((error: unknown) => {
        failed(error);
      })
      .finally(() => {
        live.current.saving = null;
      });
    live.current.saving = run;
    return run;
  };

  /**
   * What the editor holds after it has taken a value in, which is what it will hand back on
   * the next change. Plate normalizes on the way in - block ids, the trailing paragraph - so
   * the value that went in is not the value that comes out, and read against the one that went
   * in, the editor's own pass looks like an edit. Baselining what it holds keeps docs/04
   * section 3.2 true (a page nobody typed in is never written) and leaves a restored draft
   * waiting for the banner's answer instead of saving itself.
   */
  const keep = (editor: SessionEditor): void => {
    live.current.value = editor.children;
    live.current.baseline = editor.children;
  };

  const adopt = (editor: SessionEditor, value: Value): void => {
    editor.tf.setValue(value);
    keep(editor);
  };

  /** Every path that replaces what the editor holds without the user typing it. */
  const reset = (value: Value): void => {
    live.current.value = value;
    live.current.baseline = value;
    const editor = live.current.editor;
    if (editor === null) return;
    adopt(editor, value);
    // The history belongs to the value that just went away: undoing into it would put the
    // editor back to text that no longer matches the file (docs/08 section 5).
    editor.history.undos = [];
    editor.history.redos = [];
  };

  /**
   * Draft content becomes the live value without a save: the banner still owes an answer, and
   * the draft is the new baseline, so Plate's own change event for the swap is not read as an
   * edit. Typing on top of it is (docs/04 section 3.3).
   */
  const applyDraft = (draft: Draft, base: string | null): void => {
    reset(now.current.codec.toValue(draft.body));
    live.current.base = base;
    live.current.pendingDraft = null;
  };

  const flush = async (): Promise<void> => {
    clear('draft', 'save', 'retry', 'saved');
    if (live.current.dirty) writeDraft();
    await live.current.saving;
    if (live.current.dirty) await save();
  };

  return {
    flush,

    bind: (editor: SessionEditor): void => {
      live.current.editor = editor;
      // An editor that already holds the session's value - the usual mount, and every mode
      // swap - only hands over what it made of it. One that does not was mounted with the
      // file while a draft or an unsaved edit was live, and is given that instead.
      if (sameValue(editor.children, live.current.value)) keep(editor);
      else adopt(editor, live.current.value);
    },

    onChange: (value: Value): void => {
      live.current.value = value;
      // Plate fires on selection moves, on the normalization pass it runs at mount and on every
      // reset this file makes; none is an edit, and an unedited page must produce zero writes
      // (docs/04 section 3.2).
      if (!live.current.dirty && sameValue(value, live.current.baseline)) return;
      live.current.dirty = true;
      const current = status();
      if (current === 'conflict') {
        // The file moved under the user: keep the banner up and the draft fresh, save nothing.
        writeDraft();
        return;
      }
      if (current === 'offline') {
        // A retry is already scheduled and will pick up this value (docs/04 section 3.4).
        writeDraft();
        return;
      }
      patch({ status: 'dirty', draftRestored: false, draftAt: null });
      arm();
    },

    discard: (): void => {
      clear('draft', 'idle', 'save', 'retry', 'saved');
      live.current.dirty = false;
      live.current.attempt = 0;
      live.current.base = now.current.page.version;
      live.current.body = now.current.page.body;
      live.current.seen = now.current.page.version;
      reset(now.current.initial);
      void now.current.drafts.remove(now.current.id);
      now.current.store.getState().reset(now.current.id);
    },

    resolveConflict: async (choice: 'reload' | 'overwrite'): Promise<void> => {
      const { client, codec, id, keys, provider } = now.current;
      if (choice === 'overwrite') {
        const error: unknown = now.current.store.getState().sessions[id]?.error;
        const current = isConflictError(error)
          ? error.currentVersion
          : (client.getQueryData<PageDocument>(keys.page(id))?.version ?? null);
        live.current.base = current;
        patch({ status: 'dirty', error: null });
        await save();
        return;
      }
      clear('draft', 'idle', 'save', 'retry', 'saved');
      const fresh = await provider.getPage(id);
      client.setQueryData(keys.page(id), fresh);
      live.current.dirty = false;
      live.current.attempt = 0;
      live.current.base = fresh.version;
      live.current.body = fresh.body;
      live.current.seen = fresh.version;
      reset(codec.toValue(fresh.body));
      void now.current.drafts.remove(id);
      now.current.store.getState().reset(id);
    },

    compareDraft: (): { file: string; draft: string } | null => {
      const pending = live.current.pendingDraft;
      return pending === null ? null : { file: live.current.body, draft: pending.body };
    },

    resolveDraft: (choice: 'keep' | 'discard'): void => {
      const pending = live.current.pendingDraft;
      if (choice === 'discard') {
        void now.current.drafts.remove(now.current.id);
        live.current.pendingDraft = null;
        // Only a restored draft is in the editor; a mismatched one never got there.
        if (pending === null) {
          live.current.dirty = false;
          reset(now.current.initial);
        }
        patch({ status: 'clean', draftRestored: false, draftMismatch: false, draftAt: null });
        return;
      }
      if (pending !== null) applyDraft(pending, now.current.page.version);
      live.current.dirty = true;
      patch({ status: 'dirty', draftRestored: false, draftMismatch: false });
      arm();
    },

    /** docs/04 section 3.3, both paths. A draft never wins over something the user just typed. */
    restore: (draft: Draft): void => {
      if (live.current.dirty || status() !== 'clean') return;
      if (draft.baseVersion === now.current.page.version) {
        applyDraft(draft, draft.baseVersion);
        patch({ status: 'draft', draftRestored: true, draftAt: draft.updatedAt });
        now.current.onEvent({ type: 'draft:restored', id: now.current.id });
        return;
      }
      live.current.pendingDraft = draft;
      patch({ draftMismatch: true, draftAt: draft.updatedAt });
    },

    refreshed: (version: string, body: string, value: Value): void => {
      if (version === live.current.seen) return;
      live.current.seen = version;
      // A rename, a move or an icon rewrites the frontmatter, so the file is a new version
      // with the same body - including the module's own first-title rename, which lands while
      // the user is typing into the page it renames (docs/03 section 4.7). Nothing to reload
      // and nothing to overwrite: the edit carries on against the version the file has now.
      if (body === live.current.body) {
        live.current.base = version;
        return;
      }
      live.current.body = body;
      if (live.current.dirty) {
        clear('draft', 'save', 'retry');
        patch({ status: 'conflict', pending: false });
        now.current.onEvent({ type: 'page:conflict', id: now.current.id });
        return;
      }
      live.current.base = version;
      reset(value);
    },

    /**
     * docs/04 section 4: the page the provider just created is the page already open. The value,
     * the dirty flag and the timers stay where they are; the version to save against, the draft
     * and the status entry move over to the id the rest of the module uses from now on.
     */
    rekey: (from: NodeId, version: string): void => {
      live.current.base = version;
      live.current.body = now.current.page.body;
      live.current.seen = version;
      void now.current.drafts.remove(from);
      const store = now.current.store.getState();
      const state = store.sessions[from];
      if (state === undefined) return;
      store.reset(from);
      store.patch(now.current.id, state);
    },

    /** The window-level flush and retry triggers of docs/04 sections 3.1 and 3.4. */
    listen: (guardUnload: boolean): (() => void) => {
      const onHidden = (): void => {
        if (document.visibilityState === 'hidden') void flush();
      };
      const onPageHide = (): void => void flush();
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 's' || !(event.metaKey || event.ctrlKey)) return;
        // docs/07 section 2: the browser keeps `Cmd+S` everywhere outside the module.
        const target = event.target;
        if (!(target instanceof Element) || target.closest('.docs-root') === null) return;
        event.preventDefault();
        void flush();
      };
      const onRetry = (): void => {
        if (status() === 'offline') void save();
      };
      const onBeforeUnload = (event: BeforeUnloadEvent): void => {
        if (guardUnload && hasUnsavedWork(ns)) event.preventDefault();
      };
      document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('online', onRetry);
      window.addEventListener('focus', onRetry);
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => {
        document.removeEventListener('visibilitychange', onHidden);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('online', onRetry);
        window.removeEventListener('focus', onRetry);
        window.removeEventListener('beforeunload', onBeforeUnload);
      };
    },

    stop: (): void => {
      clear('draft', 'idle', 'save', 'retry', 'saved');
    },
  };
}

/**
 * docs/04 section 4: a save touches the tree's `updatedAt` too. The snapshot version carries a
 * suffix rather than staying put, because the index built from it is memoized on that string.
 */
function touchTree(
  client: ReturnType<typeof useQueryClient>,
  keys: ReturnType<typeof useDocs>['keys'],
  id: NodeId,
  result: SaveResult,
): void {
  client.setQueriesData<TreeSnapshot>({ queryKey: [...keys.all, 'tree'] }, (snapshot) => {
    if (!snapshot?.nodes.some((node) => node.id === id)) return snapshot;
    const base = snapshot.version.split('~')[0] ?? snapshot.version;
    return {
      version: `${base}~${result.version}`,
      nodes: snapshot.nodes.map((node) =>
        node.id === id ? { ...node, updatedAt: result.updatedAt } : node,
      ),
    };
  });
}
