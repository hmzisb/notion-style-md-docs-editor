import * as z from 'zod';

/**
 * Wire schemas (D-18). Validated where data enters the module: http adapter responses,
 * fixtures and the playground's remote mode. Never inside React components.
 */

export const PageIconSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('emoji'), value: z.string().min(1) }),
    z.object({ kind: z.literal('lucide'), name: z.string().min(1) }),
  ])
  .meta({ id: 'PageIcon' });

export const NodeKindSchema = z.enum(['page', 'folder']).meta({ id: 'NodeKind' });

export const TreeNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: NodeKindSchema,
    title: z.string(),
    path: z.string(),
    parentId: z.string().nullable(),
    childIds: z.array(z.string()),
    icon: PageIconSchema.optional(),
    updatedAt: z.string().optional(),
  })
  .meta({ id: 'TreeNode' });

export const TreeSnapshotSchema = z
  .object({ version: z.string(), nodes: z.array(TreeNodeSchema) })
  .meta({ id: 'TreeSnapshot' });

/** Loose: unknown frontmatter keys pass through untouched (docs/03 section 5). */
export const PageMetaSchema = z
  .looseObject({
    id: z.string().optional(),
    title: z.string().optional(),
    icon: z.string().optional(),
    order: z.number().optional(),
  })
  .meta({ id: 'PageMeta' });

export const PageDocumentSchema = z
  .object({
    id: z.string().min(1),
    meta: PageMetaSchema,
    body: z.string(),
    version: z.string().min(1),
    updatedAt: z.string(),
    eol: z.enum(['lf', 'crlf']).optional(),
  })
  .meta({ id: 'PageDocument' });

export const SavePageInputSchema = z
  .object({ body: z.string(), baseVersion: z.string().nullable() })
  .meta({ id: 'SavePageInput' });

export const SaveResultSchema = z
  .object({ version: z.string().min(1), updatedAt: z.string() })
  .meta({ id: 'SaveResult' });

export const PageMetaPatchSchema = z
  .object({ title: z.string().optional(), icon: z.string().optional() })
  .meta({ id: 'PageMetaPatch' });

export const CreatePageInputSchema = z
  .object({
    parentId: z.string().nullable(),
    title: z.string(),
    index: z.number().int().nonnegative().optional(),
  })
  .meta({ id: 'CreatePageInput' });

export const MovePageInputSchema = z
  .object({ parentId: z.string().nullable(), index: z.number().int().nonnegative() })
  .meta({ id: 'MovePageInput' });

export const SearchHitSchema = z
  .object({ id: z.string().min(1), title: z.string(), snippet: z.string().optional() })
  .meta({ id: 'SearchHit' });

export const CapabilitiesSchema = z
  .object({
    write: z.boolean(),
    move: z.boolean(),
    delete: z.boolean(),
    upload: z.boolean(),
    search: z.boolean(),
    subscribe: z.boolean(),
  })
  .meta({ id: 'ProviderCapabilities' });

export const BackendMetaSchema = z
  .object({
    contractVersion: z.number().int().positive(),
    capabilities: CapabilitiesSchema,
    title: z.string().optional(),
    rootId: z.string().optional(),
  })
  .meta({ id: 'BackendMeta' });

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
  .meta({ id: 'ProviderErrorCode' });

export const ErrorSchema = z
  .object({
    error: z.object({
      code: ProviderErrorCodeSchema,
      message: z.string(),
      currentVersion: z.string().optional(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ErrorEnvelope' });

export const ChangeEventSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('tree'), version: z.string() }),
    z.object({ type: z.literal('page'), id: z.string(), version: z.string() }),
  ])
  .meta({ id: 'ChangeEvent' });

export const UploadAssetResultSchema = z
  .object({ path: z.string(), url: z.string() })
  .meta({ id: 'UploadAssetResult' });

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
