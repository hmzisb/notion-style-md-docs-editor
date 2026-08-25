import { useEffect, useRef, type RefObject } from 'react';

/** docs/07 section 1. `input` is any text entry outside the editor: rename, title, search. */
export type HotkeyScope = 'global' | 'tree' | 'content' | 'editor' | 'input';

export interface Hotkey {
  /** `Mod` is Cmd on macOS and Ctrl elsewhere: `Mod+Shift+E`, `Mod+\`. */
  keys: string;
  /** Default: everywhere but the editor and a text input (docs/07 section 1). */
  scopes?: readonly HotkeyScope[];
  run: (event: KeyboardEvent) => void;
}

export const ALL_SCOPES: readonly HotkeyScope[] = ['global', 'tree', 'content', 'editor', 'input'];
const DEFAULT_SCOPES: readonly HotkeyScope[] = ['global', 'tree', 'content'];

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgent);

const CODES: Record<string, string> = { '\\': 'Backslash', ',': 'Comma', '.': 'Period' };

const codeFor = (key: string): string => {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return CODES[key] ?? key;
};

/**
 * Compares the physical key rather than the character: `Alt+N` types `˜` on macOS, so `event.key`
 * cannot answer for a letter. `event.key` stays as the fallback for named keys and for anything
 * that dispatches without a `code`.
 */
export function matchesKeys(event: KeyboardEvent, keys: string): boolean {
  const parts = keys.split('+');
  const key = parts.at(-1) ?? '';
  if (parts.includes('Mod') !== (event.metaKey || event.ctrlKey)) return false;
  if (parts.includes('Shift') !== event.shiftKey) return false;
  if (parts.includes('Alt') !== event.altKey) return false;
  return event.code === codeFor(key) || event.key.toLowerCase() === key.toLowerCase();
}

const MAC_GLYPHS: Record<string, string> = {
  Mod: '⌘',
  Alt: '⌥',
  Shift: '⇧',
  Ctrl: '⌃',
  Enter: '↵',
  Escape: 'esc',
};

const PC_LABELS: Record<string, string> = {
  Mod: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Ctrl: 'Ctrl',
  Enter: 'Enter',
  Escape: 'Esc',
};

/** docs/07 section 2: the same binding as a tooltip or menu hint, `⌘⌥N` or `Ctrl+Alt+N`. */
export function formatKeys(keys: string): string {
  const mac = isMac();
  const glyphs = keys
    .split('+')
    .map(
      (part) =>
        (mac ? MAC_GLYPHS[part] : PC_LABELS[part]) ??
        (part.length === 1 ? part.toUpperCase() : part),
    );
  return glyphs.join(mac ? '' : '+');
}

const NON_TEXT_INPUT = new Set([
  'button',
  'checkbox',
  'radio',
  'submit',
  'reset',
  'range',
  'color',
  'file',
]);

const isTextEntry = (element: Element): boolean => {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUT.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
};

/** The scope a key event belongs to, read from where it came from (docs/07 section 1). */
export function scopeOf(target: EventTarget | null): HotkeyScope {
  if (!(target instanceof Element)) return 'global';
  if (target.closest('[data-slate-editor]') !== null) return 'editor';
  if (isTextEntry(target)) return 'input';
  if (target.closest('[role="tree"]') !== null) return 'tree';
  if (target.closest('[data-docs-content]') !== null) return 'content';
  return 'global';
}

/**
 * Binds `hotkeys` for as long as the caller is mounted. The array is read through a ref, so a
 * host that rebuilds it every render does not rebind the listener.
 */
export function useHotkeys(hotkeys: readonly Hotkey[], root?: RefObject<HTMLElement | null>): void {
  const latest = useRef(hotkeys);
  latest.current = hotkeys;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target: EventTarget | null = event.target;
      // docs/07 section 1: inside `.docs-root`. Nothing focused means the body, which every
      // shell on the page answers for, because no element claims that keystroke.
      const inside =
        root?.current == null ||
        !(target instanceof Node) ||
        target === document.body ||
        root.current.contains(target);
      if (!inside) return;

      const scope = scopeOf(target);
      for (const hotkey of latest.current) {
        if (!(hotkey.scopes ?? DEFAULT_SCOPES).includes(scope)) continue;
        if (!matchesKeys(event, hotkey.keys)) continue;
        event.preventDefault();
        hotkey.run(event);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [root]);
}
