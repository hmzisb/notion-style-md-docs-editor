import type { PageIcon } from './model.js';

/**
 * Frontmatter carries an icon as one string: an emoji, or `"lucide:<name>"`
 * (docs/03 section 5). Anything else is dropped rather than rendered as a broken glyph.
 */

const LUCIDE_PREFIX = 'lucide:';
const LUCIDE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/**
 * Emoji are short, even the ZWJ sequences. A longer string in this key is prose that
 * landed in the wrong place, and rendering it as an icon would wreck the row.
 */
const MAX_EMOJI_UNITS = 16;

export function parseIcon(value: unknown): PageIcon | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  if (trimmed.startsWith(LUCIDE_PREFIX)) {
    const name = trimmed.slice(LUCIDE_PREFIX.length);
    return LUCIDE_NAME.test(name) ? { kind: 'lucide', name } : undefined;
  }
  return trimmed.length <= MAX_EMOJI_UNITS ? { kind: 'emoji', value: trimmed } : undefined;
}

export function formatIcon(icon: PageIcon): string {
  return icon.kind === 'lucide' ? `${LUCIDE_PREFIX}${icon.name}` : icon.value;
}
