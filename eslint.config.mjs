// ESLint for the mod's TypeScript: the recommended rules of ESLint and the
// type-checked ones of typescript-eslint, which read the types (a promise left
// unhandled, one passed where nothing awaits it). Prettier owns the layout (npm
// run format:check), and the type check (npm run typecheck) what the types say.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules/', '.claude-plugin/types/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // A name prefixed with _ is unused on purpose (a hook's argument it does not need).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The engine's `on` takes async hooks by design, and checking a promise
      // passed as an argument against its thousands of overloads never ends;
      // a promise passed to an element's handler (onPress) is still checked.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
    },
  },
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
)
