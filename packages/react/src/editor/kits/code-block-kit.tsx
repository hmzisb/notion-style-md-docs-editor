'use client';

import { CodeBlockRules } from '@platejs/code-block';
import { CodeBlockPlugin, CodeLinePlugin, CodeSyntaxPlugin } from '@platejs/code-block/react';
import { common, createLowlight } from 'lowlight';
import { CodeBlockElement, CodeLineElement, CodeSyntaxLeaf } from '@/editor/ui/code-block-node';

/**
 * docs/05 section 2: the languages are registered one by one rather than through lowlight's
 * `all`, which carries every grammar highlight.js ships and would dominate the editor chunk.
 * Each grammar brings its own aliases, so `ts`, `js`, `md`, `html` and `sh` resolve too.
 */
const LANGUAGES = [
  'bash',
  'css',
  'diff',
  'go',
  'javascript',
  'json',
  'markdown',
  'php',
  'plaintext',
  'python',
  'rust',
  'shell',
  'sql',
  'typescript',
  'xml',
  'yaml',
] as const;

const lowlight = createLowlight(
  // `common` is a wide record, so an index read is `LanguageFn | undefined` under
  // `noUncheckedIndexedAccess`; every name in the list is one of its own keys.
  Object.fromEntries(LANGUAGES.map((name) => [name, common[name]])) as Parameters<
    typeof createLowlight
  >[0],
);

export const CodeBlockKit = [
  CodeBlockPlugin.configure({
    inputRules: [CodeBlockRules.markdown({ on: 'match' })],
    node: { component: CodeBlockElement },
    options: { lowlight },
    shortcuts: { toggle: { keys: 'mod+alt+8' } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
];
