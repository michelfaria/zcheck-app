/**
 * Teste de RENDERIZAÇÃO do Painel consolidado.
 *
 *   cd ibr-checklists-app && node tests/painel-render.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * A consolidação de abas produziu três defeitos seguidos que passaram por
 * `npm run verify`, pelos 71 testes de dates/rounds, pelo teste de conferência
 * E pelo portão do PDF — e foram todos encontrados por inspeção humana:
 *
 *   1. o segmento analítico aparecia VAZIO para gestão, porque `vista` nascia em
 *      'conferir' e, embutido, o seletor Conferir/Análise não é renderizado —
 *      então os blocos gateados por `vista === 'analise'` nunca entravam;
 *   2. o conteúdo embutido caía numa coluna de 280px, porque `.zc-rep` é um grid
 *      de duas colunas e sem a coluna de filtros o resultado vira o primeiro
 *      item e ocupa a faixa estreita;
 *   3. blocos migravam de lugar sem ninguém notar que sumiram do produto.
 *
 * Nenhum é erro de cálculo. Os três são erros de RENDERIZAÇÃO, e o portão mais
 * forte que havia — comparar o PDF exportado com o baseline — é estruturalmente
 * cego para eles: `exportPDF` lê `filtered`/`summary`/`groups` direto do motor e
 * NUNCA toca no JSX. Bloco que não renderiza não muda um dígito do arquivo.
 *
 * Este é o primeiro portão do projeto que olha para o que foi renderizado. Não
 * precisa de sessão logada nem de segredo (que é o que impede o Playwright de
 * cobrir tela logada, ver tests/visual-baseline.spec.js): renderiza componente
 * puro sobre fixtures, no servidor, com `renderToStaticMarkup`.
 *
 * Efeitos não rodam em SSR — de propósito. O que se afirma aqui é a PRIMEIRA
 * pintura, que é exatamente onde os três defeitos moravam.
 */

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// ── Bundle: Node não parseia JSX, e não há build step para testes ────────────
// DENTRO do projeto: `react` fica externo ao bundle, e a resolução de módulo do
// Node sobe a árvore de diretórios procurando `node_modules`. Num diretório
// temporário do sistema ela não acha nada e o import falha.
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-painel-render');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { ReportsBody } from '${process.cwd()}/components/painel/ReportsView.js';
  export { useRelatorio } from '${process.cwd()}/components/painel/useRelatorio.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  // O projeto escreve JSX em `.js`, como o Next aceita; o esbuild não assume
  // isso sozinho e falha com "JSX syntax extension is not currently enabled".
  loader: { '.js': 'jsx' },
  // React sai de fora para o componente usar a MESMA instância que o teste —
  // duas cópias de React quebram os hooks com um erro que não explica nada.
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  // `lucide-react` resolve para o build CJS, que faz `require('react')`. Num
  // bundle ESM o esbuild troca isso por um shim que só sabe lançar erro — a não
  // ser que exista um `require` de verdade em escopo. Este banner cria um.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { ReportsBody, useRelatorio } = await import(out);

// ── Fixtures ────────────────────────────────────────────────────────────────
const unit = { id: 'u1', name: 'Loja Teste', color: '#8a2be2', sectors: ['Salão'], timezone: 'America/Sao_Paulo' };
const hoje = new Date().toISOString().slice(0, 10);
const templates = [{
  id: 't1', unitId: 'u1', sector: 'Salão', name: 'Abertura Salão', shift: 'Manhã',
  deadline: '10:00', active: true,
  items: [{ id: 'i1', text: 'Ligar luzes' }, { id: 'i2', text: 'Conferir caixa', critical: true }],
}];
const completions = [{
  id: 'c1', templateId: 't1', unitId: 'u1', sector: 'Salão', date: hoje,
  templateName: 'Abertura Salão', operatorName: 'Ana', operatorUserId: 'p1',
  completedAt: `${hoje}T09:30:00.000Z`,
  items: [{ id: 'i1', done: true }, { id: 'i2', done: true, critical: true, hasPhoto: true }],
}];
const users = [{ id: 'p1', name: 'Ana', role: 'colaborador', unitId: 'u1' }];
const gestor = { id: 'g1', name: 'Chefe', role: 'gestao', unitId: null };

const base = {
  unit, templates, completions, closures: [], users,
  canSeeAllUnits: true, allUnitsSelected: false,
  currentUser: gestor, onReview: () => {}, disputes: [], onResolveDispute: () => {},
};

/** Renderiza o ReportsBody com o motor de verdade (o hook roda no render). */
const render = (extra = {}, over = {}) => {
  const props = { ...base, ...over };
  const Harness = () => h(ReportsBody, { ...props, ...extra, rel: useRelatorio(props) });
  return renderToStaticMarkup(h(Harness));
};

const tem = (html, s) => html.includes(s);

// ── 1. Embutido: cada lente mostra o seu, e só o seu ────────────────────────
console.log('═══ segmentos do Painel (embedded) ═══');

const tendencia = render({ embedded: true, segment: 'tendencia' });
check(tem(tendencia, 'Feito do entregue'), 'Tendência traz os StatCards');
check(tem(tendencia, 'dia da semana') || tem(tendencia, 'DESEMPENHO POR DIA'), 'Tendência traz o dia da semana');
check(!tem(tendencia, 'Nível de realização por colaborador'), 'Tendência NÃO traz o bloco de pessoas');
check(!tem(tendencia, 'Execuções do período'), 'Tendência NÃO traz as execuções');

const pessoas = render({ embedded: true, segment: 'pessoas' });
check(tem(pessoas, 'Nível de realização por colaborador'), 'Pessoas traz o bloco de colaborador');
check(!tem(pessoas, 'Feito do entregue'), 'Pessoas NÃO traz os StatCards');
check(!tem(pessoas, 'Execuções do período'), 'Pessoas NÃO traz as execuções');

const registros = render({ embedded: true, segment: 'registros' });
check(tem(registros, 'Execuções do período'), 'Registros traz as execuções');
check(!tem(registros, 'Feito do entregue'), 'Registros NÃO traz os StatCards');

// ── 2. A regressão que deixou o segmento vazio ──────────────────────────────
console.log('\n═══ regressão: `vista` travada em conferir ═══');
// `vista` NASCE em 'conferir' para quem confere (canReview). Embutido, o seletor
// Conferir/Análise não é renderizado, então ninguém troca o valor — e os blocos
// gateados por `vista === 'analise'` sumiam. Quem manda embutido é o `segment`.
check(tem(tendencia, 'Feito do entregue'),
  'gestão (canReview) vê os analíticos embutida, apesar de `vista` nascer em conferir');
check(!tem(tendencia, 'Conferir') || !tem(tendencia, 'Análise'),
  'o seletor Conferir/Análise não é renderizado embutido');

// ── 3. A regressão do layout espremido ──────────────────────────────────────
console.log('\n═══ regressão: grid de filtros no modo embutido ═══');
// `.zc-rep` é `grid-template-columns: 280px minmax(0,1fr)`. Sem a coluna de
// filtros, o resultado vira o PRIMEIRO item do grid e ocupa os 280px.
const raizEmb = tendencia.slice(0, 200);
check(!tem(raizEmb, 'zc-rep"') && !tem(raizEmb, 'zc-rep '),
  'embutido, a raiz NÃO carrega a classe de grid `zc-rep`');
check(!tem(raizEmb, 'zc-view'),
  'embutido, a raiz NÃO carrega `zc-view` (o Painel já é um; dois somam padding)');
check(!tem(tendencia, 'zc-rep-filters'),
  'embutido, a coluna de filtros não é renderizada');

// ── 4. A aba própria não mudou ──────────────────────────────────────────────
console.log('\n═══ aba própria (não embutida) segue igual ═══');
// Quem confere cai em Conferir, que é a tarefa de todo dia — e ali o resto da
// análise (inclusive o Exportar) não aparece. É o comportamento de sempre.
const solta = render({});
check(tem(solta, 'zc-rep'), 'solta, a raiz mantém o grid de duas colunas');
check(tem(solta, 'zc-rep-filters'), 'solta, a coluna de filtros aparece');
check(tem(solta, 'Conferir') && tem(solta, 'Análise'), 'solta, o seletor Conferir/Análise aparece para quem confere');
check(!tem(solta, 'Execuções do período'), 'solta em Conferir, a análise não é renderizada');

// Sem `onReview` não há conferência: `vista` nasce em 'analise' e a tela abre
// direto no conteúdo analítico, sem seletor. Sem `segment`, `seg()` devolve true
// para tudo — nada é escondido por engano.
const soltaAnalise = render({}, { onReview: undefined });
check(tem(soltaAnalise, 'Exportar'), 'solta em Análise, o bloco Exportar do rodapé continua lá');
check(tem(soltaAnalise, 'Feito do entregue'), 'solta em Análise, os StatCards aparecem');
check(tem(soltaAnalise, 'Execuções do período'), 'solta em Análise, as execuções aparecem');

await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
