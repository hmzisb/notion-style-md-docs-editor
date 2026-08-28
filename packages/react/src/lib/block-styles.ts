/**
 * docs/06 sections 3 and 7, in one place because two renderers draw the same page: the static
 * `view/nodes.tsx` and the editor's node components. docs/05 section 8 swaps between them
 * without a remount, so any class that differs shows up as a jump under the reader's caret.
 */
export const blockStyles = {
  blockquote: 'my-1 border-l-[3px] border-foreground pl-4',
  callout: 'my-1 flex gap-3 rounded-md bg-muted p-4',
  calloutIcon: 'mt-0.5 size-5 shrink-0',
  code: 'rounded-[4px] bg-muted px-[0.3em] py-[0.15em] font-mono text-[85%]',
  codeBlock: 'my-1',
  /** 12 px of hit area around a 1 px rule. */
  hrBox: 'my-2 flex h-3 items-center',
  hrRule: 'w-full border-t border-border',
  h1: 'mt-8 mb-1 text-[30px] leading-[1.3] font-bold first:mt-0',
  h2: 'mt-6 mb-0.5 text-2xl leading-[1.3] font-semibold first:mt-0',
  h3: 'mt-4 mb-0.5 text-xl leading-[1.3] font-semibold first:mt-0',
  image: 'my-2',
  /**
   * The figure is the picture's box, not the column's. Without `w-fit` a narrow image sits in
   * a full-width figure, and the centred caption below it lines up with the page rather than
   * with the picture. `mx-auto` is what `align` already does to a resized image in the editor
   * (`center` is its default, and Markdown carries no alignment), applied here so the read
   * view and the editor put the same picture in the same place (docs/05 section 8).
   */
  figure: 'm-0 mx-auto w-fit max-w-full',
  /** docs/06 section 7: the visible caption of docs/05 section 5, under the image. */
  caption: 'mt-1 text-center text-sm text-muted-foreground',
  p: 'py-[3px]',
  table: 'my-2 overflow-x-auto',
  /** The summary line of a toggle; the blocks inside it are indented siblings. */
  toggle: 'flex items-start gap-1 py-[3px] font-medium',
  toggleChevron: 'size-4 shrink-0 text-muted-foreground transition-transform',
  td: 'border border-border px-2 py-1 align-top',
  th: 'border border-border bg-muted/50 px-2 py-1 text-start align-top font-medium',
} as const;
