'use client';

import {
  ChevronRight,
  Code2,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  Info,
  LinkIcon,
  ListIcon,
  ListOrdered,
  Minus,
  PilcrowIcon,
  Quote,
  Square,
  Table,
} from 'lucide-react';
import { KEYS, type TComboboxInputElement } from 'platejs';
import { PlateElement, type PlateEditor, type PlateElementProps } from 'platejs/react';
import { useDocs } from '@/data/context.js';
import type { DocsStrings } from '@/data/strings.js';
import { insertBlock, insertInlineElement } from '@/editor/transforms';
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

interface SlashItem {
  icon: React.ReactNode;
  /** The block type the item inserts, and the key the combobox filters on. */
  value: string;
  /** Both lines of the row (docs/06 section 8), as string keys so a host can retitle them. */
  name: keyof DocsStrings;
  description: keyof DocsStrings;
  /** Extra search terms: the Markdown that produces the block, and the usual other names. */
  keywords?: string[];
  /** An inline element opens its own popover, which is what takes the focus back. */
  inline?: boolean;
}

interface SlashGroup {
  label: keyof DocsStrings;
  items: SlashItem[];
}

/**
 * docs/06 section 8, over the v1 block set (docs/05 section 2): the registry item's AI group
 * and its advanced blocks - TOC, columns, equations, excalidraw, dates and footnotes - have
 * no plugin in this module, so they are not offered. Exported for the codec test that holds
 * this menu to docs/05 section 5: a block belongs here only once it round-trips.
 */
export const SLASH_GROUPS: SlashGroup[] = [
  {
    label: 'editor.slash.basic',
    items: [
      {
        icon: <PilcrowIcon />,
        value: KEYS.p,
        name: 'editor.block.p',
        description: 'editor.blockDesc.p',
        keywords: ['paragraph', 'plain'],
      },
      {
        icon: <Heading1Icon />,
        value: KEYS.h1,
        name: 'editor.block.h1',
        description: 'editor.blockDesc.h1',
        keywords: ['title', 'h1', '#'],
      },
      {
        icon: <Heading2Icon />,
        value: KEYS.h2,
        name: 'editor.block.h2',
        description: 'editor.blockDesc.h2',
        keywords: ['subtitle', 'h2', '##'],
      },
      {
        icon: <Heading3Icon />,
        value: KEYS.h3,
        name: 'editor.block.h3',
        description: 'editor.blockDesc.h3',
        keywords: ['subtitle', 'h3', '###'],
      },
      {
        icon: <Quote />,
        value: KEYS.blockquote,
        name: 'editor.block.blockquote',
        description: 'editor.blockDesc.blockquote',
        keywords: ['citation', 'quote', '>'],
      },
      {
        icon: <Info />,
        value: KEYS.callout,
        name: 'editor.block.callout',
        description: 'editor.blockDesc.callout',
        keywords: ['note', 'warning', 'alert', 'aside', '[!'],
      },
      {
        icon: <ChevronRight />,
        value: KEYS.toggle,
        name: 'editor.block.toggle',
        description: 'editor.blockDesc.toggle',
        keywords: ['collapse', 'details', 'summary', 'accordion', '<details'],
      },
      {
        icon: <Minus />,
        value: KEYS.hr,
        name: 'editor.block.hr',
        description: 'editor.blockDesc.hr',
        keywords: ['divider', 'rule', 'separator', '---'],
      },
    ],
  },
  {
    label: 'editor.slash.lists',
    items: [
      {
        icon: <ListIcon />,
        value: KEYS.ul,
        name: 'editor.block.ul',
        description: 'editor.blockDesc.ul',
        keywords: ['unordered', 'bullet', 'ul', '-'],
      },
      {
        icon: <ListOrdered />,
        value: KEYS.ol,
        name: 'editor.block.ol',
        description: 'editor.blockDesc.ol',
        keywords: ['ordered', 'ol', '1.'],
      },
      {
        icon: <Square />,
        value: KEYS.listTodo,
        name: 'editor.block.listTodo',
        description: 'editor.blockDesc.listTodo',
        keywords: ['checklist', 'task', 'checkbox', '[]'],
      },
    ],
  },
  {
    label: 'editor.slash.media',
    items: [
      {
        icon: <ImageIcon />,
        value: KEYS.img,
        name: 'editor.block.img',
        description: 'editor.blockDesc.img',
        keywords: ['picture', 'photo', 'media', '!['],
      },
    ],
  },
  {
    label: 'editor.slash.advanced',
    items: [
      {
        icon: <Code2 />,
        value: KEYS.codeBlock,
        name: 'editor.block.codeBlock',
        description: 'editor.blockDesc.codeBlock',
        keywords: ['snippet', 'fence', '```'],
      },
      {
        icon: <Table />,
        value: KEYS.table,
        name: 'editor.block.table',
        description: 'editor.blockDesc.table',
        keywords: ['grid', 'rows', 'columns'],
      },
      {
        icon: <LinkIcon />,
        value: KEYS.link,
        name: 'editor.block.link',
        description: 'editor.blockDesc.link',
        keywords: ['url', 'href', 'anchor'],
        inline: true,
      },
    ],
  },
];

const select = (editor: PlateEditor, item: SlashItem): void => {
  if (item.inline) insertInlineElement(editor, item.value);
  else insertBlock(editor, item.value, { upsert: true });
};

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>,
): React.JSX.Element {
  const { editor, element } = props;
  const { strings } = useDocs();

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        {/* docs/06 section 8: the popover surface, with the group padding of a menu. */}
        <InlineComboboxContent className="max-h-80 w-72 rounded-lg border border-border p-1 text-popover-foreground">
          <InlineComboboxEmpty>{strings['editor.slash.empty']}</InlineComboboxEmpty>

          {SLASH_GROUPS.map((group) => (
            <InlineComboboxGroup key={group.label}>
              <InlineComboboxGroupLabel className="mt-0 mb-0 px-2 py-1.5">
                {strings[group.label]}
              </InlineComboboxGroupLabel>

              {group.items.map((item) => (
                <InlineComboboxItem
                  key={item.value}
                  value={item.value}
                  onClick={() => {
                    select(editor, item);
                  }}
                  className="h-auto items-center gap-2 px-2 py-1"
                  label={strings[item.name]}
                  focusEditor={item.inline !== true}
                  group={strings[group.label]}
                  keywords={item.keywords}
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate">{strings[item.name]}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {strings[item.description]}
                    </div>
                  </div>
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
