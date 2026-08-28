import { isSafeHref, parseHref, resolvePageLink } from '@hmzisb/notion-docs-core';
import { FileText } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { TLinkElement } from 'platejs';
import { SlateElement, type SlateElementProps } from 'platejs/static';
import { useDocs } from '@/data/context.js';
import { cn } from '@/lib/utils';
import { useView } from './context.js';

/** docs/06 section 7. */
const LINK =
  'underline decoration-[1px] decoration-muted-foreground/60 underline-offset-[3px] hover:decoration-foreground';

/**
 * Every link in a page, under one policy (docs/05 sections 7 and 11):
 *
 * - Resolves to a page in the tree: navigates through `DocsNavigation`, and is a real `<a>`
 *   whenever the host gave us a URL for it, so middle click and "copy link" work.
 * - External and allowed: a plain link, new tab when the host asked for it.
 * - Anything else - an unknown page, a `javascript:` or `data:` href - renders as inert text.
 */
export function LinkStatic(props: SlateElementProps<TLinkElement>): React.JSX.Element {
  const { navigation, options } = useDocs();
  const { idByPath, node } = useView();
  const href = props.element.url;
  const pageId = resolvePageLink(node.path, href, idByPath);

  if (pageId !== null) {
    const to = navigation.href?.({ pageId });
    const open = (event: MouseEvent): void => {
      // A modified click stays the browser's: it opens the host URL in a tab of its own.
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      navigation.navigate({ pageId });
    };

    return (
      <SlateElement
        {...props}
        as={to === undefined ? 'button' : 'a'}
        className={LINK}
        attributes={{
          ...props.attributes,
          ...(to === undefined ? { type: 'button' } : { href: to }),
          onClick: open,
        }}
      >
        <FileText aria-hidden="true" className="mr-0.5 inline size-3.5 align-[-0.15em]" />
        {props.children}
      </SlateElement>
    );
  }

  // Unresolved but relative: a page the tree does not have, so there is nowhere to go.
  if (parseHref(href).external && isSafeHref(href)) {
    return (
      <SlateElement
        {...props}
        as="a"
        className={LINK}
        attributes={{
          ...props.attributes,
          href,
          rel: 'noopener noreferrer',
          ...(options.openExternalLinksInNewTab ? { target: '_blank' } : {}),
        }}
      >
        {props.children}
      </SlateElement>
    );
  }

  return (
    <SlateElement
      {...props}
      as="span"
      className={cn(LINK, 'text-muted-foreground decoration-dotted')}
      attributes={{ ...props.attributes, title: href }}
    >
      {props.children}
    </SlateElement>
  );
}
