import type { FileEntry } from '../provider.js';
import type { NodeId, PageMeta, TreeNode, TreeSnapshot } from '../model.js';
import { fnv1a64 } from '../hash.js';
import { folderHashId, pathHashId } from '../ids.js';
import { formatIcon, parseIcon } from '../icon.js';
import {
  INDEX_FILE,
  README_FILE,
  basename,
  dirname,
  humanize,
  isHidden,
  isMarkdown,
  joinPath,
  stem,
} from './paths.js';
import { compareSiblings, type Sortable } from './ordering.js';

/**
 * Files to nodes (docs/03 sections 4.1-4.4). Pure over a listing plus a per-page meta
 * reader, so the same code serves the memory store, a directory handle and a test fake.
 */

export interface PageInfo {
  meta: PageMeta;
  /** First top-level `# H1` in the body, used when frontmatter has no title. */
  firstH1?: string | undefined;
}

export type ReadPageInfo = (path: string) => Promise<PageInfo>;

export interface WalkWarning {
  code: 'duplicate_id';
  path: string;
  message: string;
}

export interface WalkResult {
  snapshot: TreeSnapshot;
  /** Surfaced through `provider.warnings` and `onEvent({ type: 'warning' })` (docs/03 section 4.2). */
  warnings: WalkWarning[];
}

const H1 = /^#[^\S\n]+(.+?)[^\S\n]*$/;
const FENCE = /^\s*(?:```|~~~)/;

/** First top-level ATX heading in a body, or null. Fenced code is skipped. */
export function firstH1(body: string): string | null {
  let inFence = false;
  for (const line of body.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = H1.exec(line);
    if (match?.[1] !== undefined) return match[1].trim();
  }
  return null;
}

interface DirInfo {
  path: string;
  dirs: string[];
  files: string[];
  /** `index.md`, else `README.md`, else null (docs/03 section 4.1). */
  indexFile: string | null;
}

function collectDirs(entries: readonly FileEntry[]): Map<string, DirInfo> {
  const dirs = new Map<string, DirInfo>();
  const dirOf = (path: string): DirInfo => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const info: DirInfo = { path, dirs: [], files: [], indexFile: null };
    dirs.set(path, info);
    if (path !== '') dirOf(dirname(path)).dirs.push(path);
    return info;
  };
  dirOf('');

  for (const entry of entries) {
    if (entry.path === '' || isHidden(entry.path)) continue;
    if (entry.kind === 'dir') {
      dirOf(entry.path);
    } else if (isMarkdown(entry.path)) {
      dirOf(dirname(entry.path)).files.push(entry.path);
    }
  }

  for (const info of dirs.values()) {
    const names = new Set(info.files.map((file) => basename(file)));
    if (names.has(INDEX_FILE)) info.indexFile = INDEX_FILE;
    else if (names.has(README_FILE)) info.indexFile = README_FILE;
  }
  return dirs;
}

/** A directory with no Markdown anywhere beneath it is an asset folder, not a node. */
function hasPages(info: DirInfo, dirs: Map<string, DirInfo>): boolean {
  if (info.files.length > 0) return true;
  return info.dirs.some((path) => {
    const child = dirs.get(path);
    return child !== undefined && hasPages(child, dirs);
  });
}

/** Node path a directory answers to: its index page's file, or the directory itself. */
function nodePathOf(info: DirInfo): string {
  return info.indexFile === null ? info.path : joinPath(info.path, info.indexFile);
}

export async function buildSnapshotFromEntries(
  entries: readonly FileEntry[],
  readMeta: ReadPageInfo,
): Promise<WalkResult> {
  const dirs = collectDirs(entries);

  const pagePaths = [...dirs.values()].flatMap((info) => info.files);
  const infos = new Map<string, PageInfo>(
    await Promise.all(pagePaths.map(async (path) => [path, await readMeta(path)] as const)),
  );

  const warnings: WalkWarning[] = [];
  const takenIds = new Set<NodeId>();
  const nodes: TreeNode[] = [];

  const orderOf = (path: string): number | undefined => {
    const value = infos.get(path)?.meta.order;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };

  /**
   * docs/03 section 4.2: frontmatter `id` wins, the first file in walk order keeps a
   * duplicate, and everyone else falls back to the deterministic path hash.
   */
  const idFor = (path: string, meta: PageMeta | null): NodeId => {
    const declared = meta?.id;
    if (typeof declared === 'string' && declared !== '') {
      if (!takenIds.has(declared)) {
        takenIds.add(declared);
        return declared;
      }
      warnings.push({
        code: 'duplicate_id',
        path,
        message: `Frontmatter id "${declared}" is already used by another page; using the path hash instead.`,
      });
    }
    const fallback = meta === null ? folderHashId(path) : pathHashId(path);
    takenIds.add(fallback);
    return fallback;
  };

  /** docs/03 section 4.3: frontmatter title, else the first H1, else the humanised stem. */
  const titleFor = (path: string, info: PageInfo, dirPath: string, isIndex: boolean): string => {
    const declared = info.meta.title;
    if (typeof declared === 'string' && declared.trim() !== '') return declared;
    if (info.firstH1 !== undefined && info.firstH1.trim() !== '') return info.firstH1.trim();
    const name = isIndex ? basename(dirPath) : stem(path);
    return humanize(name === '' ? 'index' : name);
  };

  const makePageNode = (
    path: string,
    dirPath: string,
    isIndex: boolean,
    parentId: NodeId | null,
  ): TreeNode => {
    const info = infos.get(path) ?? { meta: {} };
    const node: TreeNode = {
      id: idFor(path, info.meta),
      kind: 'page',
      title: titleFor(path, info, dirPath, isIndex),
      path,
      parentId,
      childIds: [],
    };
    const icon = parseIcon(info.meta.icon);
    if (icon) node.icon = icon;
    const updatedAt = info.meta.updatedAt;
    if (typeof updatedAt === 'string') node.updatedAt = updatedAt;
    return node;
  };

  const makeFolderNode = (info: DirInfo, parentId: NodeId | null): TreeNode => ({
    id: idFor(info.path, null),
    kind: 'folder',
    title: humanize(basename(info.path)),
    path: info.path,
    parentId,
    childIds: [],
  });

  type Child = Sortable & ({ dir: DirInfo; file?: undefined } | { file: string; dir?: undefined });

  /** Children of a directory, sorted by docs/03 section 4.4 before ids are handed out. */
  const sortedChildren = (info: DirInfo): Child[] => {
    const children: Child[] = [];
    for (const file of info.files) {
      if (info.indexFile !== null && basename(file) === info.indexFile) continue;
      children.push({ name: basename(file), kind: 'page', order: orderOf(file), file });
    }
    for (const path of info.dirs) {
      const child = dirs.get(path);
      if (!child || !hasPages(child, dirs)) continue;
      children.push({
        name: basename(path),
        kind: child.indexFile === null ? 'folder' : 'page',
        order: child.indexFile === null ? undefined : orderOf(nodePathOf(child)),
        dir: child,
      });
    }
    return children.sort(compareSiblings);
  };

  /** Depth-first so that "first in walk order" is a stable, obvious rule. */
  const walkDir = (info: DirInfo, parentId: NodeId | null): NodeId[] => {
    const ids: NodeId[] = [];
    for (const child of sortedChildren(info)) {
      if (child.file !== undefined) {
        const node = makePageNode(child.file, info.path, false, parentId);
        nodes.push(node);
        ids.push(node.id);
        continue;
      }
      const dir = child.dir;
      const node =
        dir.indexFile === null
          ? makeFolderNode(dir, parentId)
          : makePageNode(nodePathOf(dir), dir.path, true, parentId);
      nodes.push(node);
      ids.push(node.id);
      node.childIds = walkDir(dir, node.id);
    }
    return ids;
  };

  const root = dirs.get('') ?? { path: '', dirs: [], files: [], indexFile: null };
  if (root.indexFile === null) {
    walkDir(root, null);
  } else {
    const rootNode = makePageNode(nodePathOf(root), '', true, null);
    nodes.push(rootNode);
    rootNode.childIds = walkDir(root, rootNode.id);
  }

  return { snapshot: { version: snapshotVersion(nodes, orderOf), nodes }, warnings };
}

/** docs/03 section 4.9: fnv1a64 over the ordered `(path, id, title, icon, order, kind)` list. */
function snapshotVersion(
  nodes: readonly TreeNode[],
  orderOf: (path: string) => number | undefined,
): string {
  const parts = nodes.map((node) =>
    [
      node.path,
      node.id,
      node.title,
      node.icon ? formatIcon(node.icon) : '',
      orderOf(node.path)?.toString() ?? '',
      node.kind,
    ].join(' '),
  );
  return fnv1a64(parts.join(''));
}
