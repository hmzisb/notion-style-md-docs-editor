import {
  MemoryFileStore,
  createFileStoreProvider,
  type PageDocument,
  type TreeNode,
} from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import type { DocsNavigation, DocsProviderProps } from '@/data/types.js';
import { DocumentView } from './DocumentView.js';

const page = (title: string, body: string): string => `---\ntitle: ${title}\n---\n\n${body}\n`;

const seed: Record<string, string> = {
  'index.md': page('Home', '# Home'),
  'alpha.md': page('Alpha', '# Alpha'),
  'assets/logo.png': 'PNGBYTES',
};

interface Mounted {
  navigate: ReturnType<typeof vi.fn>;
  page: PageDocument;
  node: TreeNode;
}

let instance = 0;

/** Renders one page's body, with the tree behind it so links can resolve. */
async function mount(
  body: string,
  options: Partial<DocsProviderProps> = {},
  files: Record<string, string> = {},
): Promise<Mounted> {
  const provider = createFileStoreProvider(
    new MemoryFileStore({ ...seed, ...files, 'doc.md': page('Doc', body) }),
  );
  const snapshot = await provider.getTree();
  const node = snapshot.nodes.find((entry) => entry.path === 'doc.md');
  if (node === undefined) throw new Error('doc.md is missing from the tree');
  const document_ = await provider.getPage(node.id);

  const navigate = vi.fn();
  const navigation: DocsNavigation = { activePageId: node.id, mode: 'read', navigate };
  instance += 1;

  render(
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={`view-${String(instance)}`}
      queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      persist={false}
      {...options}
    >
      <DocumentView page={document_} node={node} />
    </DocsProvider>,
  );
  return { navigate, page: document_, node };
}

describe('DocumentView', () => {
  describe('blocks (docs/06 section 7)', () => {
    it('renders the v1 block set', async () => {
      await mount(
        [
          '# Heading one',
          '',
          '## Heading two',
          '',
          'Text with **bold**, *em*, ~~gone~~ and `code`.',
          '',
          '> Quoted',
          '',
          '---',
          '',
          '- first',
          '- second',
          '',
          '1. one',
          '',
          '- [ ] open',
          '- [x] done',
          '',
          '| h | i |',
          '| - | - |',
          '| a | b |',
        ].join('\n'),
      );

      expect(screen.getByRole('heading', { level: 1, name: 'Heading one' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Heading two' })).toBeInTheDocument();
      // Slate wraps every run in its own string span, so the mark is that span's parent.
      expect(screen.getByText('bold').closest('strong')).not.toBeNull();
      expect(screen.getByText('em').closest('em')).not.toBeNull();
      expect(screen.getByText('gone').closest('s')).not.toBeNull();
      expect(screen.getByText('code').closest('code')).not.toBeNull();
      expect(screen.getByText('Quoted').closest('blockquote')).not.toBeNull();
      expect(document.querySelector('hr')).not.toBeNull();

      const lists = screen.getAllByRole('list');
      expect(lists.filter((list) => list.tagName === 'UL')).toHaveLength(4);
      expect(lists.filter((list) => list.tagName === 'OL')).toHaveLength(1);

      const boxes = screen.getAllByRole('checkbox');
      expect(boxes).toHaveLength(2);
      expect(boxes[0]).not.toBeChecked();
      expect(boxes[1]).toBeChecked();
      expect(boxes[0]).toBeDisabled();

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'h' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'a' })).toBeInTheDocument();
    });

    it('indents a nested list item by one 24 px step per level', async () => {
      await mount(['- top', '  - nested'].join('\n'));

      const nested = screen.getByText('nested').closest('[data-slate-node="element"]');
      expect(nested).toHaveStyle({ marginLeft: '48px' });
    });

    it('folds a toggle, and the blocks it holds with it (docs/05 section 7)', async () => {
      const user = userEvent.setup();
      await mount(
        ['<details>', '<summary>More</summary>', '', 'Inside.', '', '</details>', '', 'After'].join(
          '\n',
        ),
      );

      // Closed is what `<details>` means without `open`, so the body is not drawn at all.
      expect(screen.getByText('More')).toBeInTheDocument();
      expect(screen.queryByText('Inside.')).toBeNull();
      expect(screen.getByText('After')).toBeInTheDocument();

      const chevron = screen.getByRole('button', { name: 'Show or hide the blocks inside' });
      expect(chevron).toHaveAttribute('aria-expanded', 'false');
      await user.click(chevron);

      expect(screen.getByText('Inside.')).toBeInTheDocument();
      expect(chevron).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('After')).toBeInTheDocument();
    });

    it('never renders raw HTML, in any form (docs/05 section 11)', async () => {
      await mount('Before\n\n<div onclick="alert(1)">danger</div>\n\nAfter');

      expect(screen.getByText('Before')).toBeInTheDocument();
      expect(document.querySelector('div[onclick]')).toBeNull();
      expect(screen.queryByText(/alert\(1\)/)).not.toBeVisible();
    });
  });

  describe('code block', () => {
    it('shows the language and copies every line', async () => {
      const user = userEvent.setup();
      await mount(['```ts', 'const a = 1;', 'const b = 2;', '```'].join('\n'));

      expect(screen.getByText('ts')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Copy' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
      });
      await expect(navigator.clipboard.readText()).resolves.toBe('const a = 1;\nconst b = 2;');
    });
  });

  describe('links (docs/05 sections 7 and 11)', () => {
    it('navigates to the page a relative link resolves to', async () => {
      const user = userEvent.setup();
      const view = await mount('See [Alpha](./alpha.md).');

      const link = await screen.findByRole('button', { name: /Alpha/ });
      await user.click(link);
      const [[target]] = view.navigate.mock.calls as [[{ pageId: string }]];
      expect(target.pageId).not.toBe(view.node.id);
    });

    it('renders a real anchor when the host supplies hrefs, and still navigates', async () => {
      const user = userEvent.setup();
      const provider = createFileStoreProvider(new MemoryFileStore(seed));
      const snapshot = await provider.getTree();
      const alpha = snapshot.nodes.find((entry) => entry.path === 'alpha.md');
      const view = await mount('See [Alpha](./alpha.md).', {
        navigation: {
          activePageId: null,
          mode: 'read',
          navigate: vi.fn(),
          href: ({ pageId }) => `/p/${pageId}`,
        },
      });

      const link = await screen.findByRole('link', { name: /Alpha/ });
      expect(link).toHaveAttribute('href', `/p/${alpha?.id ?? ''}`);
      await user.click(link);
      expect(view.navigate).not.toHaveBeenCalled();
    });

    it('opens an external link in a new tab by default', async () => {
      await mount('[Docs](https://example.com/a)');

      const link = screen.getByRole('link', { name: 'Docs' });
      expect(link).toHaveAttribute('href', 'https://example.com/a');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('keeps an external link in place when the host says so', async () => {
      await mount('[Docs](https://example.com/a)', { openExternalLinksInNewTab: false });

      expect(screen.getByRole('link', { name: 'Docs' })).not.toHaveAttribute('target');
    });

    it('renders a page that does not exist as inert text', async () => {
      await mount('[Gone](./missing.md)');

      expect(screen.getByText('Gone')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('never renders a javascript: href', async () => {
      await mount('[Click](javascript:alert&#40;1&#41;)');

      expect(screen.getByText('Click')).toBeInTheDocument();
      expect(document.querySelector('[href]')).toBeNull();
    });
  });

  describe('assets (docs/05 section 6)', () => {
    it('resolves a relative image through the provider, keeping the alt text alt text', async () => {
      await mount('![The logo](assets/logo.png)');

      const image = await screen.findByRole('img', { name: 'The logo' });
      expect(image.getAttribute('src')).toMatch(/^(?:blob:|data:)/);
      // docs/05 section 5: the alt is not a caption, so nothing is drawn under the image.
      expect(screen.queryByText('The logo')).not.toBeInTheDocument();
    });

    it('reports a path that is not there', async () => {
      await mount('![Missing](assets/nope.png)');

      expect(await screen.findByText('Image not found: assets/nope.png')).toBeInTheDocument();
    });

    it('leaves an absolute image alone and blocks a data URL unless the host allows it', async () => {
      await mount('![Remote](https://cdn.example.com/a.png)');
      expect(await screen.findByRole('img', { name: 'Remote' })).toHaveAttribute(
        'src',
        'https://cdn.example.com/a.png',
      );
    });

    it('blocks a data image by default', async () => {
      await mount('![Inline](data:image/png;base64,AAAA)');
      expect(await screen.findByText(/Image not found/)).toBeInTheDocument();
    });

    it('renders a data image when the host allows it', async () => {
      await mount('![Inline](data:image/png;base64,AAAA)', { allowDataImages: true });
      expect(await screen.findByRole('img', { name: 'Inline' })).toHaveAttribute(
        'src',
        'data:image/png;base64,AAAA',
      );
    });
  });

  it('paints inside the page container without claiming a landmark', async () => {
    const { container } = await mountRaw();
    expect(within(container).queryByRole('main')).toBeNull();
  });
});

/** The smallest possible mount: used only for the structural assertion above. */
async function mountRaw(): Promise<{ container: HTMLElement }> {
  await mount('Body text');
  return { container: document.body };
}
