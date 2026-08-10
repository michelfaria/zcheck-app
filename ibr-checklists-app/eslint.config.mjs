/**
 * ESLint — a trava que faltava.
 *
 * POR QUE ISTO EXISTE, e por que só agora: em 10/08/2026 um `useMemo` foi
 * publicado com `today` no array de dependências, sendo que `today` é declarado
 * DENTRO do callback. ReferenceError na renderização, error boundary, app
 * inteiro fora do ar — e `npm run build` tinha compilado sem uma reclamação.
 *
 * O build do Next NÃO checa variável não declarada (é JS puro, sem tipos, e o
 * lint não roda no build). "Parse OK + build OK" vinha sendo tratado como
 * verificação e não é: os dois são incapazes de ver um identificador que não
 * existe. `no-undef` vê.
 *
 * ESCOPO DELIBERADAMENTE ESTREITO. Não é o `eslint-config-next` inteiro: um
 * arquivo de 13 mil linhas nunca lintado produziria centenas de avisos de
 * estilo, todos seriam ignorados, e a regra que pega bug real afundaria no
 * ruído. Aqui só entram regras que apontam CÓDIGO QUEBRADO — nada de
 * formatação, nada de preferência.
 *
 * Para rodar:  npm run lint
 * Antes de publicar:  npm run verify   (lint + build)
 */
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'public/**'],
  },
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // Cliente e servidor no mesmo conjunto de propósito: o repositório mistura
      // componentes de browser, rotas de API e scripts de migration, e separar
      // por pasta só criaria falso positivo quando um arquivo mudar de lugar.
      // `no-undef` continua pegando o que interessa — identificador que não
      // existe em lugar nenhum.
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
    },
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    linterOptions: {
      // Comentário de desativação que não desativa nada é lixo que engana o
      // próximo leitor.
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // ── A regra que motivou o arquivo ──
      'no-undef': 'error',

      // ── Hooks ──
      // `rules-of-hooks` é erro: hook dentro de condicional quebra a ordem
      // entre renders e produz bug que só aparece em certos caminhos.
      'react-hooks/rules-of-hooks': 'error',
      // `exhaustive-deps` fica em AVISO. Ela não teria pegado o bug do `today`
      // (aponta dependência FALTANDO, não inexistente), o legado tem dezenas de
      // casos deliberados — vários já com `eslint-disable` e justificativa —, e
      // como erro bloquearia publicação por escolhas conscientes.
      'react-hooks/exhaustive-deps': 'warn',

      // Só esta do plugin do Next, e só porque o código já tem um
      // `eslint-disable` apontando para ela: comentário que desativa uma regra
      // inexistente vira erro de configuração, e apagá-lo esconderia uma
      // decisão deliberada de quem escreveu aquela linha.
      '@next/next/no-img-element': 'warn',

      // ── As outras que apontam código quebrado, não estilo ──
      'no-dupe-keys': 'error',           // `{ a: 1, a: 2 }` — a primeira some
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-cond-assign': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-sparse-arrays': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-obj-calls': 'error',
      'no-setter-return': 'error',
      'no-class-assign': 'error',
      'getter-return': 'error',
      'no-async-promise-executor': 'error',
      'no-compare-neg-zero': 'error',

      // Variável declarada e nunca usada costuma ser sobra de refatoração — e
      // foi assim que o `calcRanking` morto ficou no arquivo. Aviso, não erro:
      // o legado tem casos demais para bloquear publicação hoje.
      'no-unused-vars': ['warn', {
        args: 'none',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
        ignoreRestSiblings: true,
      }],
    },
  },
];
