import { MemoryFileStore, createFileStoreProvider, type DocumentProvider } from '@docs/core';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsProvider } from '@/data/DocsProvider.js';
import { EditorErrorBoundary } from '@/editor/EditorErrorBoundary.js';
import type { DocsNavigation } from '@/data/types.js';
import { DocsShell } from './DocsShell.js';

/**
 * docs/05 section 8 and docs/08 section 3: a Slate value a plugin cannot render throws during
 * render. The canvas keeps the damage inside itself, and the host hears `editor_crash` - which
 * takes an editor chunk that throws, so this file stands in for one.
 */
vi.mock('@/editor-chunk.js', () => {
  const chunk = {
    EditorErrorBoundary,
    DocumentEditor: (): never => {
      throw new Error('a plugin threw');
    },
  };
  return {
    preloadEditor: () => Promise.resolve(chunk),
    useEditorChunk: () => chunk,
  };
});

const files = { 'one.md': '---\nid: p_one\ntitle: One\n---\n\n# One\n' };

beforeEach(() => {
  localStorage.clear();
});

describe('the editor crashing (docs/05 section 8)', () => {
  it('keeps the shell, offers a way back, and tells the host', async () => {
    const provider: DocumentProvider = createFileStoreProvider(new MemoryFileStore(files));
    const onEvent = vi.fn();
    const navigation: DocsNavigation = {
      activePageId: 'p_one',
      mode: 'edit',
      navigate: vi.fn(),
    };
    // React logs the error it re-threw past the boundary; the test is about what the host hears.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <DocsProvider
        provider={provider}
        navigation={navigation}
        instanceId="crash"
        queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        persist={false}
        onEvent={onEvent}
      >
        <DocsShell pageId="p_one" mode="edit" />
      </DocsProvider>,
    );

    expect(await screen.findByText('Editor failed to render this page')).toBeVisible();
    // The sidebar is still there: the crash cost the canvas, not the visit.
    expect(screen.getByRole('tree')).toBeInTheDocument();
    await waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', code: 'editor_crash', id: 'p_one' }),
      );
    });
    errors.mockRestore();
  });
});
