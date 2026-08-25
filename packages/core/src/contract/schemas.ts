import * as z from 'zod/mini';

/**
 * Wire schemas (D-18). Validated where data enters the module: http adapter responses,
 * fixtures and the playground's remote mode. Never inside React components.
 */

export const PageIconSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('emoji'), value: z.string().check(z.minLength(1)) }),
    z.object({ kind: z.literal('lucide'), name: z.string().check(z.minLength(1)) }),
  ])
  .register(z.globalRegistry, { id: 'PageIcon' });

export const NodeKindSchema = z
  .enum(['page', 'folder'])
  .register(z.globalRegistry, { id: 'NodeKind' });

export const TreeNodeSchema = z
  .object({
    id: z.string().check(z.minLength(1)),
    kind: NodeKindSchema,
    title: z.string(),
    path: z.string(),
    parentId: z.nullable(z.string()),
    childIds: z.array(z.string()),
    icon: z.optional(PageIconSchema),
    updatedAt: z.optional(z.string()),
  })
  .register(z.globalRegistry, { id: 'TreeNode' });

export const TreeSnapshotSchema = z
  .object({ version: z.string(), nodes: z.array(TreeNodeSchema) })
  .register(z.globalRegistry, { id: 'TreeSnapshot' });

/** Loose: unknown frontmatter keys pass through untouched (docs/03 section 5). */
export const PageMetaSchema = z
  .looseObject({
    id: z.optional(z.string()),
    title: z.optional(z.string()),
    icon: z.optional(z.string()),
    order: z.optional(z.number()),
  })
  .register(z.globalRegistry, { id: 'PageMeta' });

export const PageDocumentSchema = z
  .object({
    id: z.string().check(z.minLength(1)),
    meta: PageMetaSchema,
    body: z.string(),
    version: z.string().check(z.minLength(1)),
    updatedAt: z.string(),
    eol: z.optional(z.enum(['lf', 'crlf'])),
  })
  .register(z.globalRegistry, { id: 'PageDocument' });

export const SavePageInputSchema = z
  .object({ body: z.string(), baseVersion: z.nullable(z.string()) })
  .register(z.globalRegistry, { id: 'SavePageInput' });

export const SaveResultSchema = z
  .object({ version: z.string().check(z.minLength(1)), updatedAt: z.string() })
  .register(z.globalRegistry, { id: 'SaveResult' });

export const PageMetaPatchSchema = z
  .object({ title: z.optional(z.string()), icon: z.optional(z.string()) })
  .register(z.globalRegistry, { id: 'PageMetaPatch' });

export const CreatePageInputSchema = z
  .object({
    parentId: z.nullable(z.string()),
    title: z.string(),
    index: z.optional(z.int().check(z.nonnegative())),
  })
  .register(z.globalRegistry, { id: 'CreatePageInput' });

export const MovePageInputSchema = z
  .object({ parentId: z.nullable(z.string()), index: z.int().check(z.nonnegative()) })
  .register(z.globalRegistry, { id: 'MovePageInput' });

export const SearchHitSchema = z
  .object({
    id: z.string().check(z.minLength(1)),
    title: z.string(),
    snippet: z.optional(z.string()),
  })
  .register(z.globalRegistry, { id: 'SearchHit' });

export const CapabilitiesSchema = z
  .object({
    write: z.boolean(),
    move: z.boolean(),
    delete: z.boolean(),
    upload: z.boolean(),
    search: z.boolean(),
    subscribe: z.boolean(),
  })
  .register(z.globalRegistry, { id: 'ProviderCapabilities' });

export const BackendMetaSchema = z
  .object({
    contractVersion: z.int().check(z.positive()),
    capabilities: CapabilitiesSchema,
    title: z.optional(z.string()),
    rootId: z.optional(z.string()),
  })
  .register(z.globalRegistry, { id: 'BackendMeta' });

export const ProviderErrorCodeSchema = z
  .enum([
    'not_found',
    'conflict',
    'forbidden',
    'validation',
    'unsupported',
    'network',
    'quota',
    'internal',
  ])
  .register(z.globalRegistry, { id: 'ProviderErrorCode' });

export const ErrorSchema = z
  .object({
    error: z.object({
      code: ProviderErrorCodeSchema,
      message: z.string(),
      currentVersion: z.optional(z.string()),
      details: z.optional(z.unknown()),
    }),
  })
  .register(z.globalRegistry, { id: 'ErrorEnvelope' });

export const ChangeEventSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('tree'), version: z.string() }),
    z.object({ type: z.literal('page'), id: z.string(), version: z.string() }),
  ])
  .register(z.globalRegistry, { id: 'ChangeEvent' });

export const UploadAssetResultSchema = z
  .object({ path: z.string(), url: z.string() })
  .register(z.globalRegistry, { id: 'UploadAssetResult' });

/** Every named schema, in the order they appear in `components.schemas`. */
export const CONTRACT_SCHEMAS = {
  BackendMeta: BackendMetaSchema,
  ChangeEvent: ChangeEventSchema,
  CreatePageInput: CreatePageInputSchema,
  ErrorEnvelope: ErrorSchema,
  MovePageInput: MovePageInputSchema,
  NodeKind: NodeKindSchema,
  PageDocument: PageDocumentSchema,
  PageIcon: PageIconSchema,
  PageMeta: PageMetaSchema,
  PageMetaPatch: PageMetaPatchSchema,
  ProviderCapabilities: CapabilitiesSchema,
  ProviderErrorCode: ProviderErrorCodeSchema,
  SavePageInput: SavePageInputSchema,
  SaveResult: SaveResultSchema,
  SearchHit: SearchHitSchema,
  TreeNode: TreeNodeSchema,
  TreeSnapshot: TreeSnapshotSchema,
  UploadAssetResult: UploadAssetResultSchema,
} as const;
