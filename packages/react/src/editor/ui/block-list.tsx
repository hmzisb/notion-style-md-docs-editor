'use client';

import React from 'react';

import type { TListElement } from 'platejs';

import { isOrderedList } from '@platejs/list';
import { useTodoListElement, useTodoListElementState } from '@platejs/list/react';
import { type PlateElementProps, type RenderNodeWrapper, useReadOnly } from 'platejs/react';

import { Checkbox } from '@/ui/checkbox';
import { cn } from '@/lib/utils';

const config: Record<
  string,
  {
    Li: React.FC<PlateElementProps & { lineBreakBadge?: React.ReactNode }>;
    Marker: React.FC<PlateElementProps>;
  }
> = {
  todo: {
    Li: TodoLi,
    Marker: TodoMarker,
  },
};

export const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return;

  return (props) => <List {...props} />;
};

function List(props: PlateElementProps & { lineBreakBadge?: React.ReactNode }) {
  const { listStart, listStyleType } = props.element as TListElement;
  const { Li, Marker } = config[listStyleType] ?? {};
  const ordered = isOrderedList(props.element);
  const List = ordered ? 'ol' : 'ul';

  return (
    <List className="relative m-0 p-0" style={{ listStyleType }} start={listStart}>
      {Marker && <Marker {...props} />}
      {/*
        Bulleted and ordered alike are one real list holding one real item: Plate's own kit
        draws a bullet by making the block itself `display: list-item` with `role="listitem"`,
        which is a list item with no list around it - nothing an assistive technology can read
        (docs/10 section 2).
      */}
      {Li ? (
        <Li {...props} />
      ) : (
        <li>
          {props.children}
          {props.lineBreakBadge}
        </li>
      )}
    </List>
  );
}

function TodoMarker(props: PlateElementProps) {
  // Both hooks are typed `any` upstream; keeping them in one expression stops that spreading.
  const { checkboxProps } = useTodoListElement(useTodoListElementState({ element: props.element }));
  const readOnly = useReadOnly();

  return (
    <div contentEditable={false}>
      <Checkbox
        // docs/06 section 7: the 24 px marker column, and the same box the read view draws.
        className={cn(
          'absolute -left-6 top-[0.45em] size-4 rounded-[3px] border-foreground/40',
          readOnly && 'pointer-events-none',
        )}
        {...checkboxProps}
      />
    </div>
  );
}

function TodoLi(props: PlateElementProps & { lineBreakBadge?: React.ReactNode }) {
  return (
    <li
      className={cn(
        'list-none',
        (props.element.checked as boolean) && 'text-muted-foreground line-through',
      )}
    >
      {props.children}
      {props.lineBreakBadge}
    </li>
  );
}
