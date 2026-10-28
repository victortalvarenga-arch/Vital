// Linter do repositório inteiro: `npm run lint`, na raiz.
//
// Está aqui para pegar o que hoje só aparece na tela ou no log: variável que
// não existe, import que sobrou, hook do React chamado dentro de um `if`.
// Estilo de código (aspas, ponto e vírgula, espaço) não é assunto dele.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**', '**/dist/**', '**/uploads/**',
      // Material de referência trazido de fora, não é código nosso.
      'exemplo/**', 'img/**',
      // Ferramentas de assistente instaladas nesta máquina (ver .gitignore).
      '.claude/**', '.agents/**', '.cursor/**', '.gemini/**', '.impeccable/**',
    ],
  },

  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // `_` na frente marca o que sobra de propósito (argumento de callback,
      // item desestruturado só para tirar do objeto).
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_',
        caughtErrors: 'none', ignoreRestSiblings: true,
      }],
      // `catch {}` vazio é o jeito da casa de dizer "falhar aqui não importa".
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  {
    files: ['server/**/*.js', 'eslint.config.mjs', 'web/vite.config.js'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['web/src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
