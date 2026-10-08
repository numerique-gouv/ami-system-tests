import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-console': 'warn',
      // `$()` renvoie un ChainablePromiseElement : on enchaîne la méthode directement (`await $(loc).click()`),
      // pas `(await $(loc)).click()` (TS 80007, diagnostic que tsc n'émet pas). Les `await` portant sur une
      // méthode (`(await $(loc).getText()).trim()`) ou sur `$$()` passé en argument restent permis.
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression > AwaitExpression > CallExpression[callee.name='$']",
        message: "Écrire `await $(loc).method()`, pas `(await $(loc)).method()` (cf. CONTRIBUTING.md).",
      }],
    },
  },
]
