'use client';

import * as React from 'react';

import { COLOR_KEY, isTextColor, TEXT_COLOR_NAMES, type TextColor } from '@hmzisb/notion-docs-core';
import { CheckIcon } from 'lucide-react';
import { useEditorRef, useEditorSelector } from 'platejs/react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { useDocs } from '@/data/context.js';
import type { DocsStrings } from '@/data/strings.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';

import { ToolbarButton, ToolbarMenuGroup } from './toolbar';

/** The row that takes the colour off again, and the value the radio group carries for it. */
const DEFAULT = 'default';

/** Every swatch is the same circle; only what fills it changes. */
const SWATCH = 'size-4 shrink-0 rounded-full border border-border/60';

/** No colour on the selection: the trigger shows the palette itself, the way Notion's does. */
const RAINBOW = TEXT_COLOR_NAMES.map((name) => `var(--docs-text-${name})`);

type Choice = TextColor | typeof DEFAULT;

/** Default first: taking a colour off is the row that is reached for most (docs/06 section 8). */
const CHOICES: Choice[] = [DEFAULT, ...TEXT_COLOR_NAMES];

const fill = (color: Choice): string =>
  color === DEFAULT
    ? `conic-gradient(${[...RAINBOW, RAINBOW[0]].join(', ')})`
    : `var(--docs-text-${color})`;

/**
 * DEV-034. The mark is a leaf property, so the current value is read off `editor.api.marks()`
 * - the selection's marks, which is also what an empty selection carries into the next word.
 */
export function ColorToolbarButton({ className }: { className?: string }): React.JSX.Element {
  const editor = useEditorRef();
  const { strings } = useDocs();
  const [open, setOpen] = React.useState(false);

  const value = useEditorSelector((slate) => {
    const color = slate.api.marks()?.[COLOR_KEY];
    return isTextColor(color) ? color : DEFAULT;
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          className={className}
          pressed={open}
          tooltip={strings['editor.toolbar.color']}
          isDropdown
        >
          <span className={SWATCH} style={{ background: fill(value) }} />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="ignore-click-outside/toolbar min-w-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.tf.focus();
        }}
        align="start"
      >
        <ToolbarMenuGroup
          value={value}
          onValueChange={(next) => {
            // The caret keeps the mark for what is typed next, so the toolbar never leaves the
            // editor blurred with a colour half-applied.
            if (next === DEFAULT) editor.tf.removeMarks(COLOR_KEY);
            else editor.tf.addMark(COLOR_KEY, next);
          }}
          label={strings['editor.toolbar.color']}
        >
          {CHOICES.map((color) => (
            <DropdownMenuRadioItem
              key={color}
              className="min-w-[160px] pl-2 *:first:[span]:hidden"
              value={color}
            >
              <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                <DropdownMenuPrimitive.ItemIndicator>
                  <CheckIcon />
                </DropdownMenuPrimitive.ItemIndicator>
              </span>
              <span className={SWATCH} style={{ background: fill(color) }} />
              {strings[`editor.color.${color}` as keyof DocsStrings]}
            </DropdownMenuRadioItem>
          ))}
        </ToolbarMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
