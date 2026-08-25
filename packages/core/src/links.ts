import type { NodeId } from './model.js';
import { INDEX_FILE, README_FILE, dirname, joinPath, normalizePath } from './fs/paths.js';

/**
 * Markdown link resolution (docs/03 section 6). Pure string work against `idByPath`:
 * no network, no store access, so a renderer can call it per link while painting.
 */

/** `scheme:` per RFC 3986. `foo:bar` is a scheme, not a relative path — same as a browser. */
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export interface ParsedHref {
  /** Path portion, percent-decoded, without `?query` or `#fragment`. Empty for a same-page link. */
  path: string;
  /** Query without the leading `?`, or null. Never used for resolution. */
  query: string | null;
  /** Fragment without the leading `#`, percent-decoded, or null. Carried for in-page scroll. */
  fragment: string | null;
  /** A scheme (`https:`, `mailto:`) or protocol-relative (`//host`) href. Never a page. */
  external: boolean;
}

/** Percent-decodes, tolerating malformed sequences rather than throwing on user content. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Schemes a link may carry (docs/05 section 11). Everything else renders as inert text. */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * The link policy, applied where an href is accepted and again where it is rendered
 * (docs/05 section 11): `http`, `https`, `mailto` and every relative form are allowed,
 * `javascript:`, `data:`, `vbscript:` and any other scheme are not.
 */
export function isSafeHref(href: string): boolean {
  // A browser drops control characters and spaces before it reads the scheme, so
  // `java\nscript:` is `javascript:` to it. Strip the same set before matching, on a copy:
  // the href itself keeps its spaces, which are legal inside a relative path.
  // eslint-disable-next-line no-control-regex -- control characters are exactly what has to go.
  const probe = href.replace(/[\u0000-\u0020]/g, '');
  const scheme = SCHEME.exec(probe)?.[0];
  // A protocol-relative href (`//host/x`) is a remote page in relative clothing.
  if (scheme === undefined) return !probe.startsWith('//');
  return SAFE_SCHEMES.has(scheme.toLowerCase());
}

/** Splits an href into path, query and fragment. Decodes each path segment separately. */
export function parseHref(href: string): ParsedHref {
  const external = href.startsWith('//') || SCHEME.test(href);

  const hashAt = href.indexOf('#');
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const fragment = hashAt === -1 ? null : safeDecode(href.slice(hashAt + 1));

  const queryAt = beforeHash.indexOf('?');
  const rawPath = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? null : beforeHash.slice(queryAt + 1);

  const path = external ? rawPath : rawPath.split('/').map(safeDecode).join('/');
  return { path, query, fragment, external };
}

/**
 * Resolves an href against the page that contains it and returns a store path, or null
 * when the href is external or climbs above the root. `currentPath` is the containing
 * page's file path (`guides/auth.md`), not its directory form.
 */
export function normalizeRelative(currentPath: string, href: string): string | null {
  const { path, external } = parseHref(href);
  if (external) return null;
  if (path === '') return normalizePath(currentPath);
  if (path.startsWith('/')) return normalizePath(path);
  return normalizePath(joinPath(dirname(currentPath), path));
}

/**
 * Candidate store paths for a resolved target, most specific first: the path as written,
 * then the `.md` file it omits, then the index page of the directory it names.
 */
function candidatesFor(target: string): string[] {
  if (target === '') return ['', INDEX_FILE, README_FILE];
  return [target, `${target}.md`, joinPath(target, INDEX_FILE), joinPath(target, README_FILE)];
}

/**
 * Node id an internal link points at, or null for external links, traversal above the
 * root and unknown paths. `#fragment` and `?query` are ignored here; read them from
 * `parseHref` when the caller also needs to scroll.
 */
export function resolvePageLink(
  currentPath: string,
  href: string,
  idByPath: Readonly<Record<string, NodeId>>,
): NodeId | null {
  if (href === '') return null;
  const target = normalizeRelative(currentPath, href);
  if (target === null) return null;

  for (const candidate of candidatesFor(target)) {
    const id = idByPath[candidate];
    if (id !== undefined) return id;
  }
  return null;
}
