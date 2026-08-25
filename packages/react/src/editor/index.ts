/**
 * editor entry (docs/11 section 2): the Plate editor chunk. A host that only reads pages
 * never loads it - `DocsShell` imports it dynamically (docs/05 section 8).
 */
export { DocumentEditor, type DocumentEditorProps } from './DocumentEditor.js';
/** What `onReady` hands the host (docs/08 section 5), re-exported so hosts can name the type. */
export type { PlateEditor } from 'platejs/react';
export { EditorErrorBoundary, type EditorErrorBoundaryProps } from './EditorErrorBoundary.js';
export { createEditorKit, baseKitKeys, type EditorKitOptions } from './kits/editor-kit.js';
