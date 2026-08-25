'use client';

import * as React from 'react';

import type { PlateEditor, PlateElementProps } from 'platejs/react';

import {
  ChevronRightIcon,
  Code2,
  ImageIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  LightbulbIcon,
  ListIcon,
  LinkIcon,
  ListOrdered,
  PilcrowIcon,
  Quote,
  Square,
  Table,
} from 'lucide-react';
import { type TComboboxInputElement, KEYS } from 'platejs';
import { PlateElement } from 'platejs/react';

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

interface Group {
  group: string;
  items: {
    icon: React.ReactNode;
    value: string;
    onSelect: (editor: PlateEditor, value: string) => void;
    className?: string;
    focusEditor?: boolean;
    keywords?: string[];
    label?: string;
  }[];
}

/**
 * docs/06 section 8, trimmed to the v1 block set (docs/05 section 2): the registry item's AI
 * group and its advanced blocks - TOC, columns, equations, excalidraw, code drawings, dates
 * and footnotes - have no plugin in this module. P2-T05 gives the labels their strings.
 */
const groups: Group[] = [
  {
    group: 'Basic blocks',
    items: [
      {
        icon: <PilcrowIcon />,
        keywords: ['paragraph'],
        label: 'Text',
        value: KEYS.p,
      },
      {
        icon: <Heading1Icon />,
        keywords: ['title', 'h1'],
        label: 'Heading 1',
        value: KEYS.h1,
      },
      {
        icon: <Heading2Icon />,
        keywords: ['subtitle', 'h2'],
        label: 'Heading 2',
        value: KEYS.h2,
      },
      {
        icon: <Heading3Icon />,
        keywords: ['subtitle', 'h3'],
        label: 'Heading 3',
        value: KEYS.h3,
      },
      {
        icon: <ListIcon />,
        keywords: ['unordered', 'ul', '-'],
        label: 'Bulleted list',
        value: KEYS.ul,
      },
      {
        icon: <ListOrdered />,
        keywords: ['ordered', 'ol', '1'],
        label: 'Numbered list',
        value: KEYS.ol,
      },
      {
        icon: <Square />,
        keywords: ['checklist', 'task', 'checkbox', '[]'],
        label: 'To-do list',
        value: KEYS.listTodo,
      },
      {
        icon: <ChevronRightIcon />,
        keywords: ['collapsible', 'expandable'],
        label: 'Toggle',
        value: KEYS.toggle,
      },
      {
        icon: <Code2 />,
        keywords: ['```'],
        label: 'Code Block',
        value: KEYS.codeBlock,
      },
      {
        icon: <Table />,
        label: 'Table',
        value: KEYS.table,
      },
      {
        icon: <Quote />,
        keywords: ['citation', 'blockquote', 'quote', '>'],
        label: 'Blockquote',
        value: KEYS.blockquote,
      },
      {
        description: 'Insert a highlighted block.',
        icon: <LightbulbIcon />,
        keywords: ['note'],
        label: 'Callout',
        value: KEYS.callout,
      },
      {
        icon: <ImageIcon />,
        keywords: ['picture', 'media', '!['],
        label: 'Image',
        value: KEYS.img,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value, { upsert: true });
      },
    })),
  },
  {
    group: 'Inline',
    items: [
      {
        focusEditor: true,
        icon: <LinkIcon />,
        keywords: ['url', 'href'],
        label: 'Link',
        value: KEYS.link,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertInlineElement(editor, value);
      },
    })),
  },
];

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

              {items.map(({ focusEditor, icon, keywords, label, value, onSelect }) => (
                <InlineComboboxItem
                  key={value}
                  value={value}
                  onClick={() => {
                    onSelect(editor, value);
                  }}
                  label={label}
                  focusEditor={focusEditor}
                  group={group}
                  keywords={keywords}
                >
                  <div className="mr-2 text-muted-foreground">{icon}</div>
                  {label ?? value}
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
