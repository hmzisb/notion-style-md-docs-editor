'use client';

import * as React from 'react';

import { useLinkToolbarButton, useLinkToolbarButtonState } from '@platejs/link/react';
import { Link } from 'lucide-react';

import { useDocs } from '@/data/context.js';
import { ToolbarButton } from './toolbar';

export function LinkToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>,
): React.JSX.Element {
  const state = useLinkToolbarButtonState();
  const { props: buttonProps } = useLinkToolbarButton(state);
  const { strings } = useDocs();

  return (
    <ToolbarButton
      {...props}
      {...buttonProps}
      data-plate-focus
      tooltip={strings['editor.toolbar.link']}
    >
      <Link />
    </ToolbarButton>
  );
}
