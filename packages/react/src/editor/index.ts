/**
 * editor entry (docs/11 section 2): the Plate editor chunk. A host that only reads pages
 * never loads it - `DocsShell` imports it dynamically (docs/05 section 8).
 */
export { DocumentEditor, type DocumentEditorProps } from './DocumentEditor.js';
export { EditorErrorBoundary, type EditorErrorBoundaryProps } from './EditorErrorBoundary.js';
export { createEditorKit, baseKitKeys, type EditorKitOptions } from './kits/editor-kit.js';
