/**
 * Teste de RENDERIZAÇÃO da régua de prazo, na tela de conferência.
 *
 *   cd ibr-checklists-app && node tests/prazo-render.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Em 15/08/2026 a conferência de "Fechamento Sala" (prazo 18:20, entregue às
 * 18:20) dizia PRAZO: atrasado, listava "8 itens concluídos fora do prazo" e
 * carimbava a tarja em todas as tarefas. A pessoa cumpriu o minuto combinado e
 * a tela — que mostra "prazo 18:20" duas linhas acima — a acusou por causa dos
 * SEGUNDOS, que não aparecem em lugar nenhum do produto.
 *
 * A correção está em `deadlineEnd` (lib/dates.js): o prazo vence no fim do seu
 * minuto. Os testes de unidade em tests/dates.spec.js e tests/rounds.spec.js
 * cobrem a régua; este cobre o que a pessoa LÊ, que é coisa diferente — o
 * cálculo por tarefa vive dentro do `ReviewModal` e não passa por `exportPDF`
 * nem pelo motor analítico. É a mesma lição de tests/painel-render.spec.mjs:
 * bloco que não renderiza (ou tarja que renderiza sem dever) não muda um dígito
 * de arquivo nenhum.
 *
 * Não precisa de sessão logada: monta o componente sobre fixtures, com
 * `renderToStaticMarkup`.
 */

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// ── Bundle ──────────────────────────────────────────────────────────────────
// Mesmas amarras de tests/painel-render.spec.mjs: JSX em `.js`, React externo
// (duas cópias quebram os hooks) e o banner do `require` para o lucide-react.
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-prazo-render');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { ReviewModal } from '${process.cwd()}/components/painel/ReportsView.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { ReviewModal, UnitsContext } = await import(out);

// ── Fixtures: o caso real, em Brasília ──────────────────────────────────────
const unit = { id: 'u1', name: 'IBR2', timezone: 'America/Sao_Paulo' };
const DIA = '2026-08-14';
const templates = [{
  id: 't1', unitId: 'u1', sector: 'Sala', name: 'Fechamento Sala',
  deadline: '18:20', active: true,
  items: [
    { id: 'i1', text: 'Guardar o caixa' },
    { id: 'i2', text: 'Trancar portas da frente com cadeados', critical: true },
  ],
}];

/** 18:20 no relógio da loja é 21:20Z; o `+seg` empurra dentro do minuto. */
const brt = (hh, mm, ss = 0) =>
  `${DIA}T${String(hh + 3).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.000Z`;

const execucao = quando => ({
  id: 'c1', templateId: 't1', unitId: 'u1', sector: 'Sala', date: DIA,
  templateName: 'Fechamento Sala', operatorName: 'Maria', operatorUserId: 'p1',
  completedAt: quando,
  items: [
    { id: 'i1', text: 'Guardar o caixa', done: true, doneAt: quando },
    { id: 'i2', text: 'Trancar portas da frente com cadeados', critical: true, done: true, doneAt: quando },
  ],
});

const render = quando => renderToStaticMarkup(
  h(UnitsContext.Provider, { value: [unit] },
    h(ReviewModal, {
      completion: execucao(quando), templates, accent: '#8a2be2',
      onClose: () => {}, onReview: () => {}, onOpenPhoto: () => {},
    })),
);

const tem = (html, s) => html.includes(s);

// ── 1. Dentro do minuto do prazo: nada de atraso ────────────────────────────
console.log('═══ entregue DENTRO do minuto do prazo (18:20) ═══');

for (const [rotulo, quando] of [
  ['18:20:00 — o segundo exato', brt(18, 20, 0)],
  ['18:20:37 — o caso da tela', brt(18, 20, 37)],
  ['18:20:59 — o último segundo', brt(18, 20, 59)],
]) {
  const html = render(quando);
  check(tem(html, 'no prazo'), `${rotulo}: a métrica PRAZO diz "no prazo"`);
  check(!tem(html, '>atrasado<'), `${rotulo}: a métrica PRAZO não diz "atrasado"`);
  check(!tem(html, 'fora do prazo'), `${rotulo}: nenhuma tarja "Fora do prazo"`);
  check(!tem(html, 'concluídos fora do prazo'), `${rotulo}: sem a linha de itens fora do prazo`);
}

// A execução limpa não pode acusar atenção nenhuma — é o contraponto que prova
// que as asserções acima não passaram só porque o bloco inteiro sumiu.
check(!tem(render(brt(18, 20, 37)), 'PRECISA DE ATENÇÃO'.toLowerCase())
  && !tem(render(brt(18, 20, 37)), 'Precisa de atenção'),
  'entrega pontual e completa não abre o bloco "Precisa de atenção"');

// ── 2. Minuto seguinte: o atraso continua sendo cobrado ─────────────────────
console.log('\n═══ entregue no MINUTO SEGUINTE (18:21) ═══');

const tarde = render(brt(18, 21, 0));
check(tem(tarde, '>atrasado<'), 'a métrica PRAZO diz "atrasado"');
check(tem(tarde, 'Precisa de atenção'), 'o bloco "Precisa de atenção" abre');
check(tem(tarde, '2 itens concluídos fora do prazo'), 'as 2 tarefas entram como fora do prazo');
check(tem(tarde, 'Fora do prazo'), 'a tarja por tarefa aparece');

// ── 3. O prazo é o da LOJA, não o de quem confere ───────────────────────────
// Regressão do defeito que morava na mesma linha: o cálculo por tarefa montava
// `new Date('2026-08-14T18:20:00')`, hora local do navegador. Em Manaus (UTC−4)
// a entrega das 18:20 no relógio da loja é 22:20Z — uma hora DEPOIS do que São
// Paulo chamaria de prazo.
console.log('\n═══ o prazo é o do relógio da loja ═══');

const manaus = renderToStaticMarkup(
  h(UnitsContext.Provider, { value: [{ id: 'u1', name: 'IBR2', timezone: 'America/Manaus' }] },
    h(ReviewModal, {
      completion: execucao(`${DIA}T22:20:37.000Z`), // 18:20:37 em Manaus
      templates, accent: '#8a2be2',
      onClose: () => {}, onReview: () => {}, onOpenPhoto: () => {},
    })),
);
check(tem(manaus, 'no prazo'), 'loja em Manaus: entrega às 18:20 é pontual');
check(!tem(manaus, 'fora do prazo'), 'loja em Manaus: nenhuma tarja de atraso');

console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
