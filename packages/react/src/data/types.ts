import type {
  BackendMeta,
  CodecOptions,
  DocumentProvider,
  NodeId,
  PageMode,
  ProviderCapabilities,
} from '@docs/core';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DocsEvent, DocsEventHandler } from './events.js';
import type { DocsKeys } from './keys.js';
import type { DocsStrings } from './strings.js';

/**
 * The host owns routing (D-06). The module reads where it is from `activePageId`/`mode` and
 * asks to go elsewhere through `navigate`; it never touches the URL, history or a router.
 */
export interface DocsNavigation {
  activePageId: NodeId | null;
  mode: PageMode;
  navigate: (to: { pageId: NodeId | null; mode?: PageMode }, opts?: { replace?: boolean }) => void;
  /** When present, the tree and breadcrumbs render real `<a href>` links instead of buttons. */
  href?: (to: { pageId: NodeId; mode?: PageMode }) => string;
}

export type PersistOptions = boolean | { queries?: boolean; drafts?: boolean; maxAgeMs?: number };

export interface DocsProviderProps {
  provider: DocumentProvider;
  navigation: DocsNavigation;
  /** Part of every namespace, so one app can mount two instances. Default `'default'`. */
  instanceId?: string;
  /** Reuse the host's client; otherwise the module creates one (docs/04 section 8). */
  queryClient?: QueryClient;
  strings?: Partial<DocsStrings>;
  onEvent?: DocsEventHandler;
  /** `beforeunload` prompt while a draft is dirty. Default `true`. */
  guardUnload?: boolean;
  persist?: PersistOptions;
  codec?: CodecOptions;
  openExternalLinksInNewTab?: boolean;
  allowDataImages?: boolean;
  sanitizeMarkdown?: (body: string) => string;
  children: ReactNode;
}

/** The props that decide behavior rather than identity, resolved once with their defaults. */
export interface DocsOptions {
  guardUnload: boolean;
  persist: PersistOptions;
  codec: CodecOptions | undefined;
  openExternalLinksInNewTab: boolean;
  allowDataImages: boolean;
  sanitizeMarkdown: ((body: string) => string) | undefined;
}

/** What `useDocs()` returns (docs/08 section 3). */
export interface DocsContextValue {
  provider: DocumentProvider;
  navigation: DocsNavigation;
  ns: string;
  keys: DocsKeys;
  strings: DocsStrings;
  onEvent: (event: DocsEvent) => void;
  /** From `getMeta` once it resolves, from the provider itself before that. */
  capabilities: ProviderCapabilities;
  meta: BackendMeta | null;
  options: DocsOptions;
}
