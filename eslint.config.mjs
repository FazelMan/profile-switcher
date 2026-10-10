// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'out/',
      'dist/',
      'release/',
      'coverage/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'tests/component/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The renderer must never reach Node or Electron directly; it talks to the
      // main process only through the typed preload bridge.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'Use the preload bridge (window.profileSwitcher).' },
            { name: 'fs', message: 'Filesystem access belongs to the main process.' },
            { name: 'child_process', message: 'Process launching belongs to the main process.' },
          ],
          patterns: [
            {
              group: ['node:*'],
              message: 'Node APIs are not available in the sandboxed renderer.',
            },
            {
              group: ['**/main/**'],
              message: 'The renderer must not import main-process modules.',
            },
          ],
        },
      ],
    },
  },
  {
    // CommonJS config files consumed by tools that require CommonJS.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Tests assert on values they just constructed; non-null assertions keep them readable.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'electron'], message: 'Shared code must stay platform-neutral.' },
          ],
        },
      ],
    },
  },
);
