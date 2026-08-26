'use client';

import * as React from 'react';

import type { TElement } from 'platejs';

import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import {
  CheckIcon,
  ChevronRightIcon,
  FileCodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  InfoIcon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  SquareIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorRef, useSelectionFragmentProp } from 'platejs/react';
import { useDocs } from '@/data/context.js';
import type { DocsStrings } from '@/data/strings.js';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { getBlockType, setBlockType } from '@/editor/transforms';

import { ToolbarButton, ToolbarMenuGroup } from './toolbar';

interface TurnIntoItem {
  icon: React.ReactNode;
  /** The name the slash menu gives the same block (docs/06 section 8). */
  name: keyof DocsStrings;
  value: string;
}

/**
 * docs/06 section 8. Trimmed to the blocks the module ships (docs/05 section 2): H4-H6 clamp
 * to H3 in the codec, and code drawings and columns have no plugin here.
 */
export const turnIntoItems: TurnIntoItem[] = [
  { icon: <PilcrowIcon />, name: 'editor.block.p', value: KEYS.p },
  { icon: <Heading1Icon />, name: 'editor.block.h1', value: KEYS.h1 },
  { icon: <Heading2Icon />, name: 'editor.block.h2', value: KEYS.h2 },
  { icon: <Heading3Icon />, name: 'editor.block.h3', value: KEYS.h3 },
  { icon: <ListIcon />, name: 'editor.block.ul', value: KEYS.ul },
  { icon: <ListOrderedIcon />, name: 'editor.block.ol', value: KEYS.ol },
  { icon: <SquareIcon />, name: 'editor.block.listTodo', value: KEYS.listTodo },
  { icon: <FileCodeIcon />, name: 'editor.block.codeBlock', value: KEYS.codeBlock },
  { icon: <QuoteIcon />, name: 'editor.block.blockquote', value: KEYS.blockquote },
  { icon: <InfoIcon />, name: 'editor.block.callout', value: KEYS.callout },
  { icon: <ChevronRightIcon />, name: 'editor.block.toggle', value: KEYS.toggle },
];

type DropdownMenuProps = React.ComponentProps<typeof DropdownMenuPrimitive.Root>;

export function TurnIntoToolbarButton(props: DropdownMenuProps): React.JSX.Element {
  const editor = useEditorRef();
  const { strings } = useDocs();
  const [open, setOpen] = React.useState(false);

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });
  const selectedItem = React.useMemo(
    () => turnIntoItems.find((item) => item.value === (value ?? KEYS.p)) ?? turnIntoItems[0],
    [value],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          className="h-7 min-w-[125px]"
          pressed={open}
          tooltip={strings['editor.toolbar.turnInto']}
          isDropdown
        >
          {selectedItem === undefined ? null : strings[selectedItem.name]}
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="ignore-click-outside/toolbar min-w-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.tf.focus();
        }}
        align="start"
      >
        <ToolbarMenuGroup
          value={value}
          onValueChange={(type) => {
            setBlockType(editor, type);
          }}
          label={strings['editor.toolbar.turnInto']}
        >
          {turnIntoItems.map(({ icon, name, value: itemValue }) => (
            <DropdownMenuRadioItem
              key={itemValue}
              className="min-w-[180px] pl-2 *:first:[span]:hidden"
              value={itemValue}
            >
              <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                <DropdownMenuPrimitive.ItemIndicator>
                  <CheckIcon />
                </DropdownMenuPrimitive.ItemIndicator>
              </span>
              {icon}
              {strings[name]}
            </DropdownMenuRadioItem>
          ))}
        </ToolbarMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
