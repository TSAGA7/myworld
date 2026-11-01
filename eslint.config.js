import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'supabase/**', 'feed-data/**', '**/*.json'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['scripts/**/*.{mjs,ts}', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },
);
