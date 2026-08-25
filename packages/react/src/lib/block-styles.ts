/**
 * docs/06 sections 3 and 7, in one place because two renderers draw the same page: the static
 * `view/nodes.tsx` and the editor's node components. docs/05 section 8 swaps between them
 * without a remount, so any class that differs shows up as a jump under the reader's caret.
 */
export const blockStyles = {
  blockquote: 'my-1 border-l-[3px] border-foreground pl-4',
  code: 'rounded-[4px] bg-muted px-[0.3em] py-[0.15em] font-mono text-[85%]',
  codeBlock: 'my-1',
  /** 12 px of hit area around a 1 px rule. */
  hrBox: 'my-2 flex h-3 items-center',
  hrRule: 'w-full border-t border-border',
  h1: 'mt-8 mb-1 text-[30px] leading-[1.3] font-bold first:mt-0',
  h2: 'mt-6 mb-0.5 text-2xl leading-[1.3] font-semibold first:mt-0',
  h3: 'mt-4 mb-0.5 text-xl leading-[1.3] font-semibold first:mt-0',
  image: 'my-2',
  p: 'py-[3px]',
  table: 'my-2 overflow-x-auto',
  td: 'border border-border px-2 py-1 align-top',
  th: 'border border-border bg-muted/50 px-2 py-1 text-start align-top font-medium',
} as const;
