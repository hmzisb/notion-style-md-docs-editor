import { BaseKit } from '@docs/core';
import { NodeIdPlugin, TrailingBlockPlugin, type AnySlatePlugin } from 'platejs';
import type { AnyPlatePlugin } from 'platejs/react';
import type { DocsStrings } from '@/data/strings.js';
import { AutoformatKit } from './autoformat-kit.js';
import { BasicBlocksKit } from './basic-blocks-kit.js';
import { BasicMarksKit } from './basic-marks-kit.js';
import { createBlockPlaceholderKit } from './block-placeholder-kit.js';
import { BlockMenuKit } from './block-menu-kit.js';
import { BlockSelectionKit } from './block-selection-kit.js';
import { CalloutKit } from './callout-kit.js';
import { CodeBlockKit } from './code-block-kit.js';
import { DndKit } from './dnd-kit.js';
import { ExitBreakKit } from './exit-break-kit.js';
import { FloatingToolbarKit } from './floating-toolbar-kit.js';
import { IndentKit } from './indent-kit.js';
import { LinkKit } from './link-kit.js';
import { ListKit } from './list-kit.js';
import { MediaKit } from './media-kit.js';
import { ShortcutsKit } from './shortcuts-kit.js';
import { SlashKit } from './slash-kit.js';
import { TableKit } from './table-kit.js';
import { ToggleKit } from './toggle-kit.js';
import { UploadPlugin } from './upload-kit.js';

/**
 * docs/05 section 1: the React half of the two kits. Every node type the codec parses has a
 * React plugin here, and the Markdown plugin is taken from the core kit unchanged, so a page
 * serializes the same whether it went through the editor, the viewer or Node.
 *
 * `editorKitCoversBaseKit` in the tests is what keeps that promise honest: a block added to
 * `BaseKit` without a component here would parse into a node the editor cannot draw.
 */

/**
 * A kit holds both halves: React plugins for anything with a component, and the headless
 * Slate plugins that carry pure behavior. Neither type is assignable to the other - the React
 * one has an options store the headless one has not - so the list is typed as either.
 */
export type EditorPlugin = AnyPlatePlugin | AnySlatePlugin;

/** Plugins with a React counterpart, in the order the registry kits compose them. */
const REACT_KITS: EditorPlugin[] = [
  ...IndentKit,
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...ListKit,
  ...CodeBlockKit,
  ...TableKit,
  ...LinkKit,
  ...MediaKit,
  ...SlashKit,
  ...CalloutKit,
  ...ToggleKit,
];

/** Behavior with no headless twin: none of it changes what a page serializes to. */
const EDITOR_ONLY: EditorPlugin[] = [
  // Block selection and DnD both address a block by its `id`, and a page parsed from Markdown
  // has none - the ids live in the editor's value only, and Markdown never sees them (D-02).
  NodeIdPlugin.configure({ options: { initialValueIds: 'always' } }),
  ...AutoformatKit,
  ...ShortcutsKit,
  ...ExitBreakKit,
  ...BlockSelectionKit,
  ...BlockMenuKit,
  ...DndKit,
  // Paste and drop of image files; inert until `DocumentEditor` hands it the page's upload.
  UploadPlugin,
  TrailingBlockPlugin,
];

export interface EditorKitOptions {
  /** The host's strings, for the placeholders that are baked into plugin options. */
  strings: DocsStrings;
  /** `'fixed'` parks the same buttons above the editor, so the floating one is dropped. */
  toolbar?: 'floating' | 'fixed' | 'none';
  /** Extra plugins, appended last so a host can override a component by key. */
  plugins?: EditorPlugin[];
}

/** Keys the core kit contributes that no React plugin replaces: the Markdown plugin. */
const headlessOnly = (base: AnySlatePlugin, react: ReadonlySet<string>): boolean =>
  !react.has(String(base.key));

export function createEditorKit({
  strings,
  toolbar = 'floating',
  plugins = [],
}: EditorKitOptions): EditorPlugin[] {
  const covered = new Set(REACT_KITS.map((plugin) => String(plugin.key)));
  return [
    ...REACT_KITS,
    // `MarkdownPlugin` and its rules, exactly as the codec configured them.
    ...BaseKit.filter((base) => headlessOnly(base, covered)),
    ...EDITOR_ONLY,
    ...(toolbar === 'floating' ? FloatingToolbarKit : []),
    ...createBlockPlaceholderKit(strings),
    ...plugins,
  ];
}

/** Every key the core kit parses into, for the coverage test and for host diagnostics. */
export const baseKitKeys: readonly string[] = BaseKit.map((plugin) => String(plugin.key));
