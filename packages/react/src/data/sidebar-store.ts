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
