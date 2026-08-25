import * as YAML from 'yaml';
import type { PageMeta } from './model.js';
import { ProviderError } from './errors.js';

/**
 * YAML frontmatter (docs/03 section 5). Markdown files are canonical (D-02), so the
 * rule here is conservative: parse what is there, hand back the body untouched, and
 * on write re-emit the same keys in the same order.
 *
 * Known limitation: YAML comments inside frontmatter are not preserved.
 */

const DELIMITER = '---';
/** Larger frontmatter is a sign of a non-docs file; refuse rather than parse it. */
export const MAX_FRONTMATTER_BYTES = 64 * 1024;

export type Eol = 'lf' | 'crlf';

export interface SplitResult {
  meta: PageMeta;
  /** Markdown after the frontmatter block, normalised to LF. */
  body: string;
  eol: Eol;
  /** False when the file had no frontmatter block at all. */
  hasFrontmatter: boolean;
  /**
   * The frontmatter block's YAML source. Passing it back to `joinFrontmatter` keeps
   * quoting, comments and layout that a plain re-serialize would flatten.
   */
  yaml: string;
}

export interface JoinOptions {
  /** The split result the meta came from. */
  source?: Pick<SplitResult, 'yaml' | 'hasFrontmatter'>;
}

/** No custom tags: `2026-01-01` stays the string the author typed. */
const YAML_PARSE_OPTIONS: YAML.ParseOptions & YAML.DocumentOptions & YAML.SchemaOptions = {
  schema: 'core',
  version: '1.2',
  customTags: [],
};

/** `lineWidth: 0` disables folding: a long value must not gain a line break on save. */
const YAML_STRINGIFY_OPTIONS: YAML.ToStringOptions &
  YAML.DocumentOptions &
  YAML.SchemaOptions &
  YAML.ParseOptions = {
  ...YAML_PARSE_OPTIONS,
  lineWidth: 0,
};

export function detectEol(raw: string): Eol {
  return raw.includes('\r\n') ? 'crlf' : 'lf';
}

export function toLf(raw: string): string {
  return raw.includes('\r') ? raw.replace(/\r\n/g, '\n') : raw;
}

export function applyEol(text: string, eol: Eol): string {
  return eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text;
}

/**
 * Splits a raw file into meta and body. A file without a frontmatter block is not an
 * error: it gets frontmatter only on first write.
 */
export function splitFrontmatter(raw: string): SplitResult {
  const eol = detectEol(raw);
  // A BOM belongs to the file, not to the YAML.
  const text = toLf(raw.startsWith('﻿') ? raw.slice(1) : raw);

  if (!text.startsWith(`${DELIMITER}\n`)) {
    return { meta: {}, body: text, eol, hasFrontmatter: false, yaml: '' };
  }

  const lines = text.split('\n');
  let closingLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === DELIMITER) {
      closingLine = i;
      break;
    }
  }
  // An unterminated opening delimiter is body text, not broken frontmatter:
  // a Markdown file may legitimately start with a horizontal rule.
  if (closingLine === -1) {
    return { meta: {}, body: text, eol, hasFrontmatter: false, yaml: '' };
  }

  const yamlSource = closingLine === 1 ? '' : `${lines.slice(1, closingLine).join('\n')}\n`;
  if (yamlSource.length > MAX_FRONTMATTER_BYTES) {
    throw new ProviderError(
      'validation',
      `Frontmatter is larger than ${String(MAX_FRONTMATTER_BYTES)} bytes.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlSource, YAML_PARSE_OPTIONS) as unknown;
  } catch (error) {
    throw new ProviderError('validation', `Frontmatter is not valid YAML: ${describe(error)}`, {
      cause: error,
    });
  }

  if (parsed === null || parsed === undefined) {
    // `---\n---\n` is empty frontmatter, not a failure.
    return {
      meta: {},
      body: lines.slice(closingLine + 1).join('\n'),
      eol,
      hasFrontmatter: true,
      yaml: yamlSource,
    };
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProviderError('validation', 'Frontmatter must be a YAML mapping.');
  }

  return {
    meta: parsed as PageMeta,
    body: lines.slice(closingLine + 1).join('\n'),
    eol,
    hasFrontmatter: true,
    yaml: yamlSource,
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);
}

/** Cheap structural comparison; only used to decide whether the YAML must be re-emitted. */
function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Emits the YAML block. When the meta is unchanged from the source it parsed from, the
 * original text is returned byte for byte, so an untouched frontmatter block never
 * gains or loses a quote. Otherwise the source document is patched key by key, which
 * keeps the author's quoting, comments and key order for everything else.
 */
function renderYaml(meta: PageMeta, source: string | undefined): string {
  if (source === undefined || source === '') return YAML.stringify(meta, YAML_STRINGIFY_OPTIONS);

  const doc = YAML.parseDocument(source, YAML_PARSE_OPTIONS);
  const current = (doc.toJS() ?? {}) as Record<string, unknown>;
  const keys = Object.keys(meta);
  if (
    keys.length === Object.keys(current).length &&
    keys.every((k) => sameValue(current[k], meta[k]))
  ) {
    return source;
  }

  for (const key of Object.keys(current)) {
    if (!(key in meta)) doc.delete(key);
  }
  for (const [key, value] of Object.entries(meta)) {
    if (!sameValue(current[key], value)) doc.set(key, value);
  }
  return doc.toString(YAML_STRINGIFY_OPTIONS);
}

/**
 * Re-emits a file. Key order follows the object's own order, so a meta that came from
 * `splitFrontmatter` and was patched in place keeps its original layout. The body is
 * written verbatim apart from the EOL style.
 */
export function joinFrontmatter(
  meta: PageMeta,
  body: string,
  eol: Eol = 'lf',
  opts: JoinOptions = {},
): string {
  const keys = Object.keys(meta);
  const bodyLf = toLf(body);
  // An empty block the author wrote is kept: dropping it would rewrite a file the
  // user did not edit.
  const keepBlock = keys.length > 0 || (opts.source?.hasFrontmatter ?? false);

  if (!keepBlock) return applyEol(bodyLf, eol);

  const yamlSource = keys.length === 0 ? '' : renderYaml(meta, opts.source?.yaml);
  // The YAML always ends with a newline, so the body follows the closing delimiter
  // directly; a fresh file gets the blank line that separates block from prose.
  const head = `${DELIMITER}\n${yamlSource}${DELIMITER}\n`;
  const separated = bodyLf === '' || bodyLf.startsWith('\n') ? bodyLf : `\n${bodyLf}`;
  return applyEol(head + separated, eol);
}

/** The typed keys of `PageMeta`; everything else is opaque pass-through. */
export const KNOWN_META_KEYS = ['id', 'title', 'icon', 'order'] as const;

/**
 * Sets a known key while keeping its position when it already exists, and appending
 * it after the other known keys when it does not.
 */
export function setMetaKey<K extends (typeof KNOWN_META_KEYS)[number]>(
  meta: PageMeta,
  key: K,
  value: PageMeta[K],
): PageMeta {
  if (value === undefined) {
    const { [key]: _dropped, ...rest } = meta;
    return rest;
  }
  // Existing keys keep their position; new ones are appended, which leaves the
  // author's own block untouched above the generated `id`.
  return { ...meta, [key]: value };
}
