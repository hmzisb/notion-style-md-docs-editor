import type { NodeId } from '@docs/core';
import { useStore, type StoreApi } from 'zustand';
import { useDocs } from './context.js';
import { perNamespace } from './local-store.js';

/** docs/06 section 4: `--docs-sidebar-width` starts at 240 px. */
export const DEFAULT_SIDEBAR_WIDTH = 240;

export interface SidebarState {
  collapsed: boolean;
  width: number;
  /** Only expanded folders are kept: a collapsed one is deleted rather than stored as `false`. */
  expanded: Record<NodeId, true>;
  lastOpenedPageId: NodeId | null;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  setWidth: (width: number) => void;
  setExpanded: (id: NodeId, expanded: boolean) => void;
  /** Replaces the whole set: what the tree hands back after its own expand/collapse. */
  setExpandedIds: (ids: readonly NodeId[]) => void;
  expandAll: (ids: readonly NodeId[]) => void;
  collapseAll: () => void;
  setLastOpenedPageId: (id: NodeId | null) => void;
}

export const sidebarStoreFor = perNamespace<SidebarState>('sidebar', (set) => ({
  collapsed: false,
  width: DEFAULT_SIDEBAR_WIDTH,
  expanded: {},
  lastOpenedPageId: null,
  setCollapsed: (collapsed) => {
    set({ collapsed });
  },
  toggleCollapsed: () => {
    set((state) => ({ collapsed: !state.collapsed }));
  },
  setWidth: (width) => {
    set({ width });
  },
  setExpanded: (id, expanded) => {
    set((state) => {
      if (expanded) return { expanded: { ...state.expanded, [id]: true } };
      return {
        expanded: Object.fromEntries(Object.entries(state.expanded).filter(([key]) => key !== id)),
      };
    });
  },
  setExpandedIds: (ids) => {
    set({ expanded: Object.fromEntries(ids.map((id) => [id, true])) });
  },
  expandAll: (ids) => {
    set((state) => ({
      expanded: { ...state.expanded, ...Object.fromEntries(ids.map((id) => [id, true])) },
    }));
  },
  collapseAll: () => {
    set({ expanded: {} });
  },
  setLastOpenedPageId: (id) => {
    set({ lastOpenedPageId: id });
  },
}));

/**
 * Sidebar preferences for the current instance (L5). With a selector, a component that reads
 * `collapsed` does not re-render when a folder is expanded.
 */
export function useSidebarStore(): SidebarState;
export function useSidebarStore<T>(selector: (state: SidebarState) => T): T;
export function useSidebarStore<T>(selector?: (state: SidebarState) => T): T | SidebarState {
  const { ns } = useDocs();
  return useStore<StoreApi<SidebarState>, T | SidebarState>(
    sidebarStoreFor(ns),
    selector ?? ((state) => state),
  );
}

const seeded = new Set<string>();

/**
 * Host defaults (docs/08 section 4) are initial values, not overrides: a width the user dragged
 * or a sidebar they opened wins on the next visit. Only a namespace that has never persisted
 * anything takes them, which is why this reads the raw key instead of comparing values.
 */
export function seedSidebar(ns: string, defaults: { width?: number; collapsed?: boolean }): void {
  if (seeded.has(ns)) return;
  seeded.add(ns);
  if (defaults.width === undefined && defaults.collapsed === undefined) return;

  let stored: string | null = null;
  try {
    // Throws rather than returning null when there is no `localStorage` at all (server, private mode).
    stored = globalThis.localStorage.getItem(`${ns}:sidebar`);
  } catch {
    stored = null;
  }
  if (stored !== null) return;

  const store = sidebarStoreFor(ns).getState();
  if (defaults.width !== undefined) store.setWidth(defaults.width);
  if (defaults.collapsed !== undefined) store.setCollapsed(defaults.collapsed);
}
