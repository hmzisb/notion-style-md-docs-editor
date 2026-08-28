import type { NodeId, ProviderErrorCode } from '@hmzisb/notion-docs-core';

/** docs/08 section 3. The host's window into everything the module does. */
export type DocsEvent =
  | { type: 'page:open'; id: NodeId }
  | { type: 'page:saved'; id: NodeId; version: string; bytes: number; ms: number }
  | { type: 'page:conflict'; id: NodeId }
  | { type: 'page:created' | 'page:deleted' | 'page:moved' | 'page:renamed'; id: NodeId }
  | { type: 'draft:restored'; id: NodeId }
  | { type: 'tree:renumbered'; count: number }
  | {
      type: 'warning';
      code: 'storage_unavailable' | 'duplicate_id' | 'lossy_document' | 'large_page';
      id?: NodeId;
      details?: unknown;
    }
  | { type: 'error'; code: ProviderErrorCode | 'editor_crash'; id?: NodeId; error: unknown };

export type DocsEventHandler = (event: DocsEvent) => void;

/**
 * `onEvent` is host code called from inside the module's render and effects. A host callback
 * that throws must not take a save or a render down with it, and it must not disappear either:
 * the error is rethrown on its own task, where the host's error reporting sees it.
 */
export function createEmitter(onEvent?: DocsEventHandler): DocsEventHandler {
  if (onEvent === undefined) return () => undefined;
  return (event) => {
    try {
      onEvent(event);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  };
}
