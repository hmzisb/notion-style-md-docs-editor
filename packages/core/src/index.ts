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
