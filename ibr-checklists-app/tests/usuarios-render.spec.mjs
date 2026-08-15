/**
 * Teste de RENDERIZAÇÃO da aba Usuários — o seletor de loja do cabeçalho.
 *
 *   cd ibr-checklists-app && node tests/usuarios-render.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * A aba Usuários recebia a lista inteira da empresa e ignorava a loja escolhida
 * no cabeçalho: trocar de IBR1 para IBR2 não mudava uma linha da tela. Não é
 * erro de cálculo — nada é calculado ali — é erro do que a tela MOSTRA, a mesma
 * classe de defeito que `painel-render.spec.mjs` existe para pegar.
 *
 * Como lá: `renderToStaticMarkup` sobre fixtures, sem sessão logada e sem
 * segredo. Efeitos não rodam em SSR, então o que se afirma aqui é a primeira
 * pintura — que é onde o filtro mora.
 */

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// Mesmo esquema de bundle do painel-render: dentro do projeto (para o Node achar
// `node_modules`), React externo (uma instância só) e o shim de `require` que o
// build CJS do lucide-react precisa.
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-usuarios-render');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { UsersView, userInUnit } from '${process.cwd()}/app/app/page.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { UsersView, userInUnit, UnitsContext } = await import(out);

// ── Fixtures ────────────────────────────────────────────────────────────────
const units = [
  { id: 'ibr1', name: 'IBR1', color: '#2f6f4e', sectors: [], timezone: 'America/Sao_Paulo' },
  { id: 'ibr2', name: 'IBR2', color: '#c026d3', sectors: [], timezone: 'America/Sao_Paulo' },
];
const users = [
  { id: 'u1', name: 'Chefe Geral', role: 'gestao', unitId: null, pin: '1111' },
  { id: 'u2', name: 'Gerente Duas Lojas', role: 'gerencia', unitId: 'ibr1,ibr2', pin: '2222' },
  { id: 'u3', name: 'Ana da Um', role: 'colaborador', unitId: 'ibr1', pin: '3333' },
  { id: 'u4', name: 'Bruno do Dois', role: 'colaborador', unitId: 'ibr2', pin: '4444' },
];
const gestor = users[0];

const render = (unitId) => renderToStaticMarkup(
  h(UnitsContext.Provider, { value: units },
    h(UsersView, { users, onSaveUsers: async () => {}, currentUser: gestor, unitId })));

const tem = (html, s) => html.includes(s);

// ── 1. "Todas" mostra a empresa inteira ─────────────────────────────────────
console.log('═══ Todas (unitId nulo) ═══');
const todas = render(null);
check(tem(todas, 'Ana da Um') && tem(todas, 'Bruno do Dois'), 'as duas lojas aparecem');
check(tem(todas, 'Chefe Geral') && tem(todas, 'Gerente Duas Lojas'), 'quem não é de uma loja só aparece');
check(tem(todas, 'Todas as lojas · 4 pessoas'), 'o escopo está escrito na tela');

// ── 2. Uma loja escolhida filtra a lista ────────────────────────────────────
console.log('\n═══ loja escolhida no cabeçalho ═══');
const ibr1 = render('ibr1');
check(tem(ibr1, 'Ana da Um'), 'IBR1 mostra quem é da IBR1');
check(!tem(ibr1, 'Bruno do Dois'), 'IBR1 NÃO mostra quem é da IBR2');
check(tem(ibr1, 'IBR1 · 3 pessoas'), 'a contagem segue o filtro');

const ibr2 = render('ibr2');
check(tem(ibr2, 'Bruno do Dois'), 'IBR2 mostra quem é da IBR2');
check(!tem(ibr2, 'Ana da Um'), 'IBR2 NÃO mostra quem é da IBR1');

// ── 3. Quem alcança a loja continua visível ─────────────────────────────────
// Diretoria (sem loja) e gerência multi-loja TÊM acesso à loja: sumir daqui
// faria a tela afirmar que a loja está sem gestão.
console.log('\n═══ quem tem acesso à loja não some ═══');
check(tem(ibr1, 'Chefe Geral'), 'diretoria (sem loja fixa) aparece na loja');
check(tem(ibr2, 'Chefe Geral'), 'e na outra também');
check(tem(ibr1, 'Gerente Duas Lojas') && tem(ibr2, 'Gerente Duas Lojas'),
  'gerência com duas lojas aparece nas duas');
check(tem(todas, 'IBR1 + IBR2'),
  'a linha da gerência multi-loja mostra as duas lojas (antes ficava em branco)');

// ── 4. O predicado, direto ──────────────────────────────────────────────────
console.log('\n═══ userInUnit ═══');
check(userInUnit({ unitId: 'ibr1' }, null) === true, 'sem loja escolhida, passa todo mundo');
check(userInUnit({ unitId: 'ibr1' }, 'ibr2') === false, 'loja diferente não passa');
check(userInUnit({ unitId: 'ibr1, ibr2' }, 'ibr2') === true, 'lista com espaço é tratada');
check(userInUnit({ unitId: null }, 'ibr2') === true, 'sem loja fixa passa em qualquer loja');

await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
