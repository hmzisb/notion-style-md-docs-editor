'use client';

import { resolvePageLink } from '@docs/core';
import { getLinkAttributes } from '@platejs/link';
import { FileText } from 'lucide-react';
import type { TLinkElement } from 'platejs';
import { PlateElement, type PlateElementProps } from 'platejs/react';
import { useEditorContext } from '@/editor/context.js';

/**
 * docs/06 section 7. The read path (`view/LinkStatic.tsx`) also resolves an internal link to
 * a page and refuses an unsafe href; in the editor a link is content being written, so it is
 * only drawn - `LinkFloatingToolbar` is what edits it, and `Cmd+click` is Plate's own.
 */
const LINK =
  'underline decoration-[1px] decoration-muted-foreground/60 underline-offset-[3px] hover:decoration-foreground';

export function LinkElement(props: PlateElementProps<TLinkElement>): React.JSX.Element {
  const { idByPath, node } = useEditorContext();
  // The icon the read view puts on a resolving internal link, drawn here too: without it the
  // line would shift by the width of an icon on the way into edit mode (docs/05 section 8).
  const resolved = resolvePageLink(node.path, props.element.url, idByPath) !== null;

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
      {resolved && (
        <span contentEditable={false}>
          <FileText aria-hidden="true" className="mr-0.5 inline size-3.5 align-[-0.15em]" />
        </span>
      )}
      {props.children}
    </PlateElement>
  );
}
