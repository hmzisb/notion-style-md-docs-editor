// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

/** Files that legitimately live outside the type-checked source graph. */
const CONFIG_FILES = ['**/*.config.ts', '**/*.config.js', 'eslint.config.js'];

/** docs/02 section 2 - element types, most specific first. */
const ELEMENTS = [
  { type: 'core', pattern: 'packages/core/src', partialMatch: false },
  { type: 'react-data', pattern: 'packages/react/src/data', partialMatch: false },
  { type: 'react-tree', pattern: 'packages/react/src/tree', partialMatch: false },
  { type: 'react-editor', pattern: 'packages/react/src/editor', partialMatch: false },
  { type: 'react-view', pattern: 'packages/react/src/view', partialMatch: false },
  { type: 'react-shell', pattern: 'packages/react/src/shell', partialMatch: false },
  { type: 'react-ui', pattern: 'packages/react/src/ui', partialMatch: false },
  { type: 'react-lib', pattern: 'packages/react/src/lib', partialMatch: false },
  { type: 'react-adapters', pattern: 'packages/react/src/adapters', partialMatch: false },
  { type: 'react-root', pattern: 'packages/react/src', partialMatch: false },
  { type: 'playground', pattern: 'apps/playground/src', partialMatch: false },
  { type: 'smoke', pattern: 'smoke/*/src', partialMatch: false },
];

/** @param {string} from @param {string[]} to */
const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: to } } } },
});

const REACT_INTERNALS = [
  'react-data',
  'react-tree',
  'react-editor',
  'react-view',
  'react-shell',
  'react-ui',
  'react-lib',
  'react-adapters',
  'react-root',
];

const POLICIES = [
  // core imports no workspace element (external packages only).
  allow('core', ['core']),
  allow('react-lib', ['react-lib']),
  allow('react-ui', ['react-ui', 'react-lib']),
  allow('react-data', ['core', 'react-data', 'react-ui', 'react-lib']),
  allow('react-tree', ['core', 'react-data', 'react-tree', 'react-ui', 'react-lib']),
  allow('react-view', ['core', 'react-data', 'react-view', 'react-ui', 'react-lib']),
  allow('react-editor', ['core', 'react-data', 'react-editor', 'react-ui', 'react-lib']),
  allow('react-shell', REACT_INTERNALS.concat('core')),
  allow('react-adapters', ['core', 'react-adapters', 'react-lib']),
  allow('react-root', REACT_INTERNALS.concat('core')),
  allow('playground', REACT_INTERNALS.concat(['core', 'playground'])),
  allow('smoke', REACT_INTERNALS.concat(['core', 'smoke'])),
];

/** Nothing in the packages may reach for the host document, URL bar or a router. */
const NO_HOST_GLOBALS = [
  {
    selector: 'MemberExpression[object.name="window"][property.name="location"]',
    message: 'The module never reads or writes the host URL. Route through DocsNavigation.',
  },
  {
    selector: 'MemberExpression[object.name="document"][property.name="title"]',
    message: 'The module never sets document.title. The host owns the document.',
  },
  {
    selector:
      'MemberExpression[object.name="location"][property.name=/^(href|hash|search|pathname|assign|replace|reload)$/]',
    message: 'The module never reads or writes the host URL. Route through DocsNavigation.',
  },
  {
    selector:
      'CallExpression[callee.object.object.name="window"][callee.object.property.name="history"]',
    message: 'The module never touches history. Route through DocsNavigation.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.tsbuild/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'fixtures/**',
      'contract/openapi.json',
      '.changeset/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description', minimumDescriptionLength: 10 },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: true },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-restricted-syntax': ['error', ...NO_HOST_GLOBALS],
    },
  },

  // Architecture boundaries (docs/02 section 2).
  {
    files: ['packages/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}', 'smoke/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      // Resolve relative TS imports and the workspace `@docs/*` specifiers so the
      // plugin classifies them as local elements instead of external modules.
      'import/resolver': {
        typescript: { project: './tsconfig.json', alwaysTryTypes: true },
      },
      'boundaries/elements': ELEMENTS,
      'boundaries/include': ['packages/**/*', 'apps/**/*', 'smoke/**/*'],
      'boundaries/ignore': ['**/*.config.ts', '**/*.test.ts', '**/*.test.tsx', '**/test/**'],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies: POLICIES }],
    },
  },

  // Package-only hygiene rules.
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.config.ts', '**/testing/**', '**/test/**'],
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['platejs/react', '@platejs/*/react'],
              message: 'Plate React entry points belong to editor/ and view/ only.',
            },
            {
              group: ['@headless-tree/*'],
              message: 'headless-tree belongs to tree/ only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/react/src/editor/**/*.{ts,tsx}',
      'packages/react/src/view/**/*.{ts,tsx}',
      'packages/core/src/codec/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@headless-tree/*'], message: 'headless-tree belongs to tree/ only.' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/react/src/tree/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Config files and scripts: no type-aware program, allow console.
  { files: CONFIG_FILES, ...tseslint.configs.disableTypeChecked },
  {
    files: [...CONFIG_FILES, 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  prettierConfig,
);
