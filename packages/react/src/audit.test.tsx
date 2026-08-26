import { MemoryFileStore, createFileStoreProvider, type DocumentProvider } from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation } from '@/data/types.js';
import { DocsShell } from '@/shell/DocsShell.js';

/**
 * docs/09 P3-T09. Three questions asked of the whole package rather than of one component:
 * does a provider that cannot write leave any way to write, does any copy reach the reader
 * without going through `strings`, and is every event in `DocsEvent` exercised somewhere.
 */

/** The package's own `src`, whether the runner starts in the package or in the workspace. */
const SRC = [join(process.cwd(), 'src'), join(process.cwd(), 'packages/react/src')].find((path) =>
  existsSync(join(path, 'data/events.ts')),
)!;

/** Every source file under `src`, minus the ones a rule says to leave alone. */
function sources(skip: (path: string) => boolean): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  return walk(SRC)
    .map((path) => path.slice(SRC.length + 1))
    .filter((path) => !skip(path));
}

const read = (path: string): string => readFileSync(join(SRC, path), 'utf8');

// ---------------------------------------------------------------- capabilities

const seed = {
  'home.md': '---\nid: p_home\ntitle: Home\n---\n\n# Home\n\nBody.\n',
  'guides/index.md': '---\nid: p_guides\ntitle: Guides\n---\n\n# Guides\n',
  'guides/auth.md': '---\nid: p_auth\ntitle: Auth\n---\n\n# Auth\n',
};

/** docs/01 section 6: what a provider says it cannot do, the UI does not offer. */
function mountReadOnly(): void {
  const base = createFileStoreProvider(new MemoryFileStore(seed));
  const capabilities = { ...base.capabilities, write: false, move: false, delete: false };
  const provider: DocumentProvider = {
    ...base,
    capabilities,
    getMeta: async () => ({ ...(await base.getMeta()), capabilities }),
  };
  const navigation: DocsNavigation = { activePageId: 'p_home', mode: 'read', navigate: vi.fn() };

  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId="audit"
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      persist={false}
    >
      <DocsShell pageId="p_home" mode="read" />
    </DocsProvider>,
  );
}

/** The name a reader would hear for each control, in the order they appear. */
const names = (role: string): string[] =>
  screen
    .getAllByRole(role)
    .map((element) => {
      const label = element.getAttribute('aria-label');
      if (label !== null) return label;
      // What is hidden from the accessibility tree is not part of the name (a shortcut hint).
      const clone = element.cloneNode(true) as HTMLElement;
      for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return clone.textContent.trim();
    })
    .filter((name) => name !== '');

beforeEach(() => {
  localStorage.clear();
});

describe('capabilities (docs/01 section 6)', () => {
  it('offers a read-only workspace nothing that writes', async () => {
    mountReadOnly();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeInTheDocument();
    });

    // Reading, navigating and opening a menu. Nothing here creates, moves or deletes a page.
    expect(names('button')).toEqual([
      'Expand all',
      'Collapse sidebar',
      'Search',
      'Home',
      'Expand Guides',
      'More options for Guides',
      'More options for Home',
      'More options',
    ]);
  });

  it('leaves the two menus only what a reader can do', async () => {
    const user = userEvent.setup();
    mountReadOnly();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeInTheDocument();
    });

    const items = async (button: string): Promise<string[]> => {
      await user.click(screen.getByRole('button', { name: button }));
      const menu = within(await screen.findByRole('menu'));
      const labels = menu
        .getAllByRole('menuitem')
        .map((item) => item.textContent.trim())
        // The page menu ends in a word count, which is a fact about the page, not an action.
        .filter((label) => !label.endsWith('words'));
      await user.keyboard('{Escape}');
      return labels;
    };

    expect(await items('More options')).toEqual(['Copy link', 'Copy as Markdown', 'Download .md']);
    // The row menu is rename, duplicate, move and delete around one link; only the link is left.
    expect(await items('More options for Home')).toEqual(['Copy link']);
  });

  it('keeps New page out of the palette', async () => {
    const user = userEvent.setup();
    mountReadOnly();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const palette = within(await screen.findByRole('dialog'));

    expect(palette.queryByRole('option', { name: /New page/ })).not.toBeInTheDocument();
    expect(palette.getByRole('option', { name: /Expand all/ })).toBeInTheDocument();
  });
});

// -------------------------------------------------------------------- strings

/** Copy reaches a reader from JSX; vendored shadcn primitives and test code are not ours. */
const NOT_COPY = (path: string): boolean =>
  !path.endsWith('.tsx') ||
  path.startsWith('ui/') ||
  path.startsWith('testing/') ||
  path.startsWith('fixtures/') ||
  /\.test\.tsx?$/.test(path);

/** `Promise<Value>` and `list?.querySelector<T>` are generics, not something a reader reads. */
const CODE = /\w\.\w|\?\./;

const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
/** Text a reader would see between two tags. */
const JSX_TEXT = />\s*([A-Za-z][A-Za-z0-9 ,.'!?:%-]{2,})\s*</g;
/** The attributes a screen reader reads out. */
const SPOKEN = /\b(aria-label|aria-description|placeholder|alt|title|tooltip|label)="([^"]{2,})"/g;

describe('strings (docs/08 section 6)', () => {
  it('reaches the reader through `strings`, never through a literal', () => {
    const offenders: string[] = [];

    for (const path of sources(NOT_COPY)) {
      const source = read(path).replaceAll(COMMENT, '');
      for (const [, text] of source.matchAll(JSX_TEXT)) {
        if (text !== undefined && !CODE.test(text)) offenders.push(`${path}: ${text}`);
      }
      for (const [, attribute, value] of source.matchAll(SPOKEN)) {
        offenders.push(`${path}: ${attribute ?? ''}="${value ?? ''}"`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

// --------------------------------------------------------------------- events

describe('events (docs/08 section 3)', () => {
  it('exercises every event the host can be handed', () => {
    // The union's own literals, so a new event is a failing test until a test drives it.
    const wanted = [
      ...new Set([...read('data/events.ts').matchAll(/'([a-z_:]+)'/g)].map(([, name]) => name)),
    ].filter((name) => name !== undefined && name !== 'internal');

    const tests = sources((path) => !/\.test\.tsx?$/.test(path) || path === 'audit.test.tsx')
      .map((path) => read(path))
      .join('\n');

    expect(wanted.filter((name) => !tests.includes(`'${name}'`))).toEqual([]);
  });
});
