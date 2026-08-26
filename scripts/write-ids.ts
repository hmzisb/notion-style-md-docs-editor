/**
 * `pnpm doctor <folder> --write-ids` (docs/03 sections 4.2 and 4.3).
 *
 * One pass over a folder that pins down what the module would otherwise infer:
 *
 * - every page gets a stable frontmatter `id`, so moving or renaming the file later keeps
 *   links, drafts and the open page pointing at it (without one the id is a hash of the path);
 * - a page whose title comes from a leading `# H1` gets that H1 as frontmatter `title`, and
 *   the heading leaves the body, because the shell already renders the title above it.
 *
 * Files that already declare both are not written at all: this runs over a corpus a user
 * owns, and a no-op has to stay a no-op down to the byte.
 */
import {
  generateId,
  isMarkdown,
  joinFrontmatter,
  splitFrontmatter,
  type FileStore,
  type PageMeta,
} from '@docs/core';

export interface WriteIdsResult {
  /** Markdown files considered, hidden and vendored ones excluded. */
  scanned: number;
  /** Paths given a fresh `id`. */
  ids: string[];
  /** Paths whose leading H1 moved into `title`. */
  titles: string[];
}

const H1 = /^#[^\S\n]+(.+?)[^\S\n]*$/;

/**
 * The heading a page opens with, and the body without it. Only a leading H1 counts: one
 * further down is a section of the page, and hoisting it would change what the page says.
 */
function leadingH1(body: string): { title: string; rest: string } | null {
  const lines = body.split('\n');
  let at = 0;
  while (at < lines.length && lines[at]?.trim() === '') at += 1;
  const match = H1.exec(lines[at] ?? '');
  const title = match?.[1]?.trim();
  if (title === undefined || title === '') return null;
  return {
    title,
    rest: lines
      .slice(at + 1)
      .join('\n')
      .replace(/^\n+/, ''),
  };
}

export async function writeIds(store: FileStore): Promise<WriteIdsResult> {
  const entries = await store.list();
  // Sorted, so a corpus with a duplicate id resolves it the same way on every run.
  const paths = entries
    .filter((entry) => entry.kind === 'file' && isMarkdown(entry.path))
    .map((entry) => entry.path)
    .sort();

  const result: WriteIdsResult = { scanned: paths.length, ids: [], titles: [] };
  const taken = new Set<string>();

  for (const path of paths) {
    const source = await store.readText(path);
    const split = splitFrontmatter(source);
    // Patched in place, so the keys a page already has keep their order and their layout.
    const meta: PageMeta = { ...split.meta };
    let body = split.body;
    let changed = false;

    const declared = typeof meta.id === 'string' ? meta.id.trim() : '';
    const id = declared === '' || taken.has(declared) ? generateId() : declared;
    if (id !== declared) {
      meta.id = id;
      result.ids.push(path);
      changed = true;
    }
    taken.add(id);

    if (typeof meta.title !== 'string' || meta.title.trim() === '') {
      const heading = leadingH1(body);
      if (heading !== null) {
        meta.title = heading.title;
        body = heading.rest;
        result.titles.push(path);
        changed = true;
      }
    }

    if (changed) {
      await store.writeText(path, joinFrontmatter(meta, body, split.eol, { source: split }));
    }
  }

  return result;
}
