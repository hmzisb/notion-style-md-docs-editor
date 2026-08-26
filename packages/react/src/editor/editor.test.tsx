import {
  BaseKit,
  MemoryFileStore,
  createFileStoreProvider,
  type PageDocument,
  type TreeNode,
} from '@docs/core';
import { loadCorpus } from '@docs/core/testing';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Value } from 'platejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import { defaultStrings } from '@/data/strings.js';
import type { DocsNavigation } from '@/data/types.js';
import { DocumentEditor } from './DocumentEditor.js';
import { baseKitKeys, createEditorKit } from './kits/editor-kit.js';

/**
 * docs/09 P2-T01. Two promises: the kit draws every block the codec can parse, and the
 * corpus - every page of it - mounts in the editor without a console error.
 */

// jsdom gives this file an http `import.meta.url`, so the loader's own root resolution runs
// from the package directory instead (same note as the adapter conformance tests).
const corpus = await loadCorpus();

const files: Record<string, string> = Object.fromEntries(
  corpus.manifest.pages.map((page) => [page.path, corpus.read(page.path)]),
);

interface Opened {
  page: PageDocument;
  node: TreeNode;
}

async function open(path: string): Promise<Opened> {
  const provider = createFileStoreProvider(new MemoryFileStore(files));
  const snapshot = await provider.getTree();
  const node = snapshot.nodes.find((entry) => entry.path === path);
  if (node === undefined) throw new Error(`${path} is missing from the tree`);
  return { node, page: await provider.getPage(node.id) };
}

let instance = 0;

type EditorProps = React.ComponentProps<typeof DocumentEditor>;

/** Renders one page in the editor, with a handle that re-renders it with new props. */
function mount(opened: Opened, props: Partial<EditorProps> = {}) {
  const provider = createFileStoreProvider(new MemoryFileStore(files));
  const navigation: DocsNavigation = {
    activePageId: opened.node.id,
    mode: 'edit',
    navigate: vi.fn(),
  };
  instance += 1;
  const instanceId = `editor-${String(instance)}`;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const tree = (extra: Partial<EditorProps>): React.JSX.Element => (
    <DocsProvider
      provider={provider}
      navigation={navigation}
      instanceId={instanceId}
      queryClient={queryClient}
      persist={false}
    >
      <DocumentEditor
        pageId={opened.node.id}
        value={[{ children: [{ text: '' }], type: 'p' }]}
        readOnly={false}
        onChange={() => undefined}
        page={opened.node}
        {...props}
        {...extra}
      />
    </DocsProvider>
  );

  const view = render(tree({}));
  return {
    ...view,
    update: (extra: Partial<EditorProps>) => {
      view.rerender(tree(extra));
    },
  };
}

describe('EditorKit (docs/05 section 1)', () => {
  it('has a plugin for every key the core kit parses into', () => {
    const keys = new Set(
      createEditorKit({ strings: defaultStrings }).map((plugin) => String(plugin.key)),
    );
    expect(baseKitKeys.filter((key) => !keys.has(key))).toEqual([]);
  });

  it('keeps the core kit as the source of the Markdown rules', () => {
    const kit = createEditorKit({ strings: defaultStrings });
    const markdown = BaseKit.find((plugin) => plugin.key === 'markdown');
    expect(markdown).toBeDefined();
    expect(kit).toContain(markdown);
  });

  it('drops the selection toolbar when the host asks for none', () => {
    const withToolbar = createEditorKit({ strings: defaultStrings }).map((p) => String(p.key));
    const without = createEditorKit({ strings: defaultStrings, toolbar: 'none' }).map((p) =>
      String(p.key),
    );
    expect(withToolbar).toContain('floating-toolbar');
    expect(without).not.toContain('floating-toolbar');
  });
});

describe('the callout variant picker (docs/05 section 5)', () => {
  const callout = (variant: string): Value => [
    { children: [{ text: 'Heads up' }], type: 'callout', variant, icon: 'info' },
  ];

  it('picks a variant instead of an emoji, and says so in the value', async () => {
    const user = userEvent.setup();
    const opened = await open('index.md');
    const onChange = vi.fn<(value: Value) => void>();
    mount(opened, { value: callout('note'), onChange });

    // docs/06 section 13: an icon-only control carries its name for a screen reader.
    await user.click(await screen.findByRole('button', { name: 'Callout style' }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Note', 'Tip', 'Important', 'Warning', 'Caution']);

    await user.click(within(menu).getByRole('menuitemradio', { name: 'Warning' }));
    // The icon follows the variant, because the Markdown has nowhere else to keep it.
    await waitFor(() => {
      expect(onChange.mock.lastCall?.[0][0]).toMatchObject({
        type: 'callout',
        variant: 'warning',
        icon: 'triangle-alert',
      });
    });
  });

  it('is not a control at all in read mode', async () => {
    const opened = await open('index.md');
    mount(opened, { value: callout('tip'), readOnly: true });
    expect(await screen.findByText('Heads up')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Callout style' })).toBeNull();
  });
});

/** docs/05 section 5: the blocks a toggle holds are the indented ones after it. */
describe('the toggle block', () => {
  const toggle = (body: boolean): Value => [
    { children: [{ text: 'Summary' }], type: 'toggle', id: 'summary' },
    ...(body ? [{ children: [{ text: 'Inside' }], type: 'p', indent: 1, id: 'body' }] : []),
  ];

  it('hides what it holds until the chevron opens it', async () => {
    const user = userEvent.setup();
    const opened = await open('index.md');
    mount(opened, { value: toggle(true) });

    // Slate needs the nodes in the DOM, so a closed toggle hides its body rather than
    // dropping it - which is the difference from the read view, where it is dropped.
    expect(await screen.findByText('Inside')).not.toBeVisible();
    const chevron = screen.getByRole('button', { name: 'Show or hide the blocks inside' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');

    await user.click(chevron);
    await waitFor(() => {
      expect(screen.getByText('Inside')).toBeVisible();
    });
    expect(chevron).toHaveAttribute('aria-expanded', 'true');
  });

  it('says it is empty while it holds nothing, and only to a writer (docs/06 section 7)', async () => {
    const opened = await open('index.md');
    const { update } = mount(opened, { value: toggle(false) });

    expect(await screen.findByText('Empty toggle. Click or drop blocks inside.')).toBeVisible();
    update({ readOnly: true });
    await waitFor(() => {
      expect(screen.queryByText('Empty toggle. Click or drop blocks inside.')).toBeNull();
    });
  });
});

describe('DocumentEditor (docs/05 section 6)', () => {
  let errors: string[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errors = [];
    spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(' '));
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it.each(corpus.manifest.pages.map((page) => page.path))(
    'renders %s without a console error',
    async (path) => {
      const opened = await open(path);
      mount(opened);
      await waitFor(() => {
        expect(document.querySelector('[data-slate-editor]')).not.toBeNull();
      });
      expect(errors).toEqual([]);
    },
  );

  it('flips read mode on the editor already mounted (docs/05 section 8)', async () => {
    const opened = await open('index.md');
    const onReady = vi.fn();
    const { update } = mount(opened, {
      onReady,
      value: [{ children: [{ text: 'Hello' }], type: 'p' }],
    });
    await screen.findByText('Hello');
    const editable = document.querySelector('[data-slate-editor]');
    expect(editable).toHaveAttribute('contenteditable', 'true');

    update({ readOnly: true });

    // The scroll container survives and the editor is never rebuilt, so the swap costs no
    // re-parse and no scroll jump. (Plate does swap the per-block wrappers, which carry the
    // drag handle and the selection overlay - read mode has neither.)
    expect(document.querySelector('[data-slate-editor]')).toBe(editable);
    expect(editable).toHaveAttribute('contenteditable', 'false');
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(errors).toEqual([]);
  });

  it('hands the session the editor instance', async () => {
    const opened = await open('index.md');
    const onReady = vi.fn();
    mount(opened, { onReady });
    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });
    const [editor] = onReady.mock.calls[0] as [{ tf: unknown }];
    expect(editor.tf).toBeDefined();
  });

  it('asks the host to edit when a reader clicks the text', async () => {
    const opened = await open('index.md');
    const onRequestEdit = vi.fn();
    mount(opened, {
      onRequestEdit,
      readOnly: true,
      value: [{ children: [{ text: 'Hello' }], type: 'p' }],
    });
    (await screen.findByText('Hello')).click();
    expect(onRequestEdit).toHaveBeenCalledTimes(1);
  });

  it('reports every change to the host', async () => {
    const opened = await open('index.md');
    const onChange = vi.fn<(value: Value) => void>();
    mount(opened, { onChange });
    await waitFor(() => {
      expect(document.querySelector('[data-slate-editor]')).not.toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
