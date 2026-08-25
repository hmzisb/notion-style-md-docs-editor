'use client';

import { getLinkAttributes } from '@platejs/link';
import type { TLinkElement } from 'platejs';
import { PlateElement, type PlateElementProps } from 'platejs/react';

/**
 * docs/06 section 7. The read path (`view/LinkStatic.tsx`) also resolves an internal link to
 * a page and refuses an unsafe href; in the editor a link is content being written, so it is
 * only drawn - `LinkFloatingToolbar` is what edits it, and `Cmd+click` is Plate's own.
 */
const LINK =
  'underline decoration-[1px] decoration-muted-foreground/60 underline-offset-[3px] hover:decoration-foreground';

export function LinkElement(props: PlateElementProps<TLinkElement>): React.JSX.Element {
  return (
    <PlateElement
      {...props}
      as="a"
      className={LINK}
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
        onMouseOver: (e) => {
          e.stopPropagation();
        },
      }}
    >
      {props.children}
    </PlateElement>
  );
}
