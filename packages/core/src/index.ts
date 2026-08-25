export type {
  BackendMeta,
  ChangeEvent,
  NodeId,
  NodeKind,
  PageDocument,
  PageIcon,
  PageMeta,
  PageMetaPatch,
  PageMode,
  ProviderCapabilities,
  SaveResult,
  SearchHit,
  TreeIndex,
  TreeNode,
  TreeSnapshot,
} from './model.js';

export type { DocumentProvider, FileEntry, FileStore } from './provider.js';

export {
  ConflictError,
  ProviderError,
  StorageQuotaError,
  isConflictError,
  isProviderError,
  type ProviderErrorCode,
} from './errors.js';

export { CONTRACT_VERSION } from './contract/version.js';
export * from './contract/schemas.js';

export { fnv1a64, pageVersion, sha256Hex } from './hash.js';
export {
  ID_LENGTH,
  folderHashId,
  generateId,
  isDerivedId,
  isGeneratedId,
  pathHashId,
} from './ids.js';

export {
  ancestorsOf,
  applyInsert,
  applyMeta,
  applyMove,
  applyRemove,
  applyRename,
  buildIndex,
  childIdsOf,
  descendantCount,
  dirFormOf,
  flatten,
  isDescendant,
  isIndexPath,
  pathAliases,
  subtreeIds,
} from './tree.js';

export {
  KNOWN_META_KEYS,
  MAX_FRONTMATTER_BYTES,
  applyEol,
  detectEol,
  joinFrontmatter,
  setMetaKey,
  splitFrontmatter,
  toLf,
  type Eol,
  type JoinOptions,
  type SplitResult,
} from './frontmatter.js';

export {
  INDEX_FILE,
  MAX_SLUG_LENGTH,
  README_FILE,
  assetBaseFor,
  basename,
  dirPathFor,
  dirname,
  extname,
  humanize,
  isHidden,
  isIndex,
  isMarkdown,
  joinPath,
  normalizePath,
  pagePathFor,
  slugify,
  stem,
  titleFromPath,
  uniqueSlug,
} from './fs/paths.js';

export {
  MIN_ORDER_GAP,
  ORDER_STEP,
  compareNatural,
  compareSiblings,
  midpointOrder,
  nextOrder,
  renumber,
  sortSiblings,
  type Sortable,
} from './fs/ordering.js';

export {
  normalizeRelative,
  parseHref,
  resolvePageLink,
  type ParsedHref,
} from './links.js';

export { formatIcon, parseIcon } from './icon.js';

export {
  MemoryFileStore,
  type MemoryFileSeed,
  type MemoryFileStoreOptions,
} from './fs/memory-store.js';

export {
  buildSnapshotFromEntries,
  firstH1,
  type PageInfo,
  type ReadPageInfo,
  type WalkResult,
  type WalkWarning,
} from './fs/walk.js';

export {
  createFileStoreProvider,
  type FileStoreProvider,
  type FileStoreProviderOptions,
} from './fs/semantics.js';
