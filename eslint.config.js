import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Globals available in Node scripts run directly (not bundled). */
const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  fetch: 'readonly',
  __dirname: 'readonly',
  require: 'readonly',
  module: 'writable',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.mmap-platform/**',
      '**/.expo/**',
      'packages/core/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    // Metro and Babel still load their config through CommonJS.
    files: ['**/*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: nodeGlobals },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
