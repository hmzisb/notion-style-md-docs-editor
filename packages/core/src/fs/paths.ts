/**
 * Path and slug rules (docs/03 sections 4.1, 4.3, 4.5). Everything here is pure string
 * work on posix paths relative to the store root: no leading slash, no `.` segments.
 */

export const INDEX_FILE = 'index.md';
export const README_FILE = 'README.md';
export const MAX_SLUG_LENGTH = 64;
const FALLBACK_SLUG = 'untitled';

/** Posix `dirname` that returns '' for a top-level path rather than '.'. */
export function dirname(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}

export function basename(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? path : path.slice(at + 1);
}

export function extname(path: string): string {
  const base = basename(path);
  const at = base.lastIndexOf('.');
  return at <= 0 ? '' : base.slice(at);
}

/** Filename without its extension. */
export function stem(path: string): string {
  const base = basename(path);
  const ext = extname(base);
  return ext === '' ? base : base.slice(0, -ext.length);
}

export function joinPath(...parts: string[]): string {
  return parts.filter((part) => part !== '').join('/');
}

export function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

export function isIndex(path: string): boolean {
  const base = basename(path);
  return base === INDEX_FILE || base === README_FILE;
}

/** True for dot-prefixed entries and `node_modules` anywhere in the path. */
export function isHidden(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') || part === 'node_modules');
}

/**
 * Normalises `.` and `..` segments. Returns null when the path climbs above the root,
 * which is how traversal is rejected at every boundary.
 */
export function normalizePath(path: string): string | null {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

const DIACRITICS = /[̀-ͯ]/g;
const NON_SLUG = /[^a-z0-9]+/g;
const TRIM_DASHES = /^-+|-+$/g;

/**
 * Title to filename slug: NFKD fold to ASCII, lowercase, non-alphanumerics to `-`,
 * collapse, trim, cap at 64 chars. An empty result becomes `untitled`.
 */
export function slugify(title: string): string {
  const folded = title.normalize('NFKD').replace(DIACRITICS, '');
  const slug = folded
    .toLowerCase()
    .replace(NON_SLUG, '-')
    .replace(TRIM_DASHES, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(TRIM_DASHES, '');
  return slug === '' ? FALLBACK_SLUG : slug;
}

/** Appends `-2`, `-3`, ... until the slug is free. `taken` holds slugs, not paths. */
export function uniqueSlug(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const suffix = `-${String(n)}`;
    const base = slug.slice(0, Math.max(1, MAX_SLUG_LENGTH - suffix.length));
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** File path for a new page with `slug` inside `dir` ('' means the store root). */
export function pagePathFor(dir: string, slug: string): string {
  return joinPath(dir, `${slug}.md`);
}

/**
 * The directory a page owns: `guides/auth/index.md` owns `guides/auth`, and the leaf
 * `guides/intro.md` owns `guides/intro` once it is converted.
 */
export function dirPathFor(pagePath: string): string {
  return isIndex(pagePath) ? dirname(pagePath) : pagePath.slice(0, -extname(pagePath).length);
}

/** The directory a page's relative links and assets resolve against. */
export function assetBaseFor(pagePath: string): string {
  return dirname(pagePath);
}

const WORD_BOUNDARY = /[-_\s]+/g;

/** `auth-flow` -> `Auth flow`. Only the first word is capitalised. */
export function humanize(name: string): string {
  const words = name.replace(WORD_BOUNDARY, ' ').trim();
  if (words === '') return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Display title for a file with no `meta.title` and no H1: the filename stem, or the
 * directory name for an index file.
 */
export function titleFromPath(path: string): string {
  const source = isIndex(path) ? basename(dirname(path)) : stem(path);
  return humanize(source === '' ? stem(path) : source);
}
