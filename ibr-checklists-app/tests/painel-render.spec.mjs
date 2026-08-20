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
  export { PainelConsolidado } from '${process.cwd()}/components/painel/PainelConsolidado.js';
  export { buildJit } from '${process.cwd()}/components/painel/JitPanel.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
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
  /**
   * Conta quantas vezes `useRelatorio` roda, SEM tocar no código de produção.
   *
   * O motor deriva `filtered`, `summary`, `groups`, `collaborators` e a
   * produtividade da empresa inteira. Ele não pode rodar para o colaborador, que
   * não vê um número dele — e "não renderiza" não é a mesma coisa que "não
   * calcula". Só um contador distingue as duas.
   */
  plugins: [{
    name: 'conta-useRelatorio',
    setup(b) {
      const real = `${process.cwd()}/components/painel/useRelatorio.js`;
      // `null` para o que vem de DENTRO do wrapper: sem isso o import dele
      // para o módulo real é reinterceptado e a função chama a si mesma.
      b.onResolve({ filter: /useRelatorio(\.js)?$/ }, args => (
        args.namespace === 'conta' ? null : { path: real, namespace: 'conta' }
      ));
      b.onLoad({ filter: /.*/, namespace: 'conta' }, () => ({
        contents: `import { useRelatorio as _r } from ${JSON.stringify(real)};
          export function useRelatorio(p) {
            globalThis.__relCalls = (globalThis.__relCalls || 0) + 1;
            return _r(p);
          }`,
        resolveDir: process.cwd(),
      }));
    },
  }],
});
const { ReportsBody, useRelatorio, PainelConsolidado, buildJit, UnitsContext } = await import(out);

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
// Os três nomes do Conjunto A (§B.6). "Checklists entregues" conta rodada
// submetida, completa ou parcial; "Checklists 100%" conta só as terminadas. A
// distância entre os dois é o tamanho do trabalho entregue pela metade — e foi
// exatamente essa distância que o rótulo antigo ("Checklists concluídos")
// escondia, chamando de concluído o que estava pela metade.
check(tem(tendencia, 'Checklists 100%'), 'Tendência traz o cartão "Checklists 100%"');
check(tem(tendencia, 'Checklists entregues'), 'Tendência traz "Checklists entregues"');
check(!tem(tendencia, 'Checklists concluídos'), 'o rótulo antigo, que chamava parcial de concluído, sumiu');
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

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL CONSOLIDADO — a fronteira de acesso
//
// A restrição dura nº 1 do plano: "a linha do colaborador não muda uma vírgula".
// Ela foi verificada três vezes com PIN real, o que prova o dia em que foi
// verificada — e nada sobre o commit seguinte. Daqui em diante ela é portão.
// ═══════════════════════════════════════════════════════════════════════════

const colaborador = { id: 'p1', name: 'Ana', role: 'colaborador', unitId: 'u1', sectorId: null };
const lider = { id: 'l1', name: 'Carla', role: 'lideranca', unitId: 'u1' };

const jit = buildJit(completions, templates, [], [unit], 'u1', 'u1');

const painel = (user, over = {}) => renderToStaticMarkup(
  h(UnitsContext.Provider, { value: [unit] },
    h(PainelConsolidado, {
      unit, templates, completions, closures: [], users,
      canSeeAllUnits: user.unitId == null, currentUser: user,
      jit, actionPlans: [], plansLoaded: true,
      onCreatePlan: () => {}, onCompletePlan: () => {}, onNavigate: () => {},
      allUnitsSelected: false, onReview: () => {}, disputes: [], onResolveDispute: () => {},
      ...over,
    })));

console.log('\n═══ colaborador: os 8 blocos de §D.1, e NADA além ═══');
const colab = painel(colaborador);

// O que ele TEM hoje e não pode perder.
check(tem(colab, 'Dia ·'), '1. navegador de data');
check(tem(colab, 'Feito do previsto'), '3. score do dia, com o rótulo da aderência');
check(tem(colab, 'Ontem') && tem(colab, 'Média 7 dias'), '4. ontem / média 7 dias');
check(tem(colab, 'Por tipo de checklist'), '5. por tipo de checklist');
check(tem(colab, 'Aderência por dia · 7 dias'), '6. faixa fixa de 7 dias');
check(tem(colab, 'Ranking da equipe'), '7. ranking da equipe');

// O que ele NÃO pode ver. Cada linha aqui é um vazamento potencial.
check(!tem(colab, 'Você marcou para tratar'), 'AGORA: sem follow-up de planos');
check(!tem(colab, 'Leitura da operação'), 'AGORA: sem insight');
check(!tem(colab, 'Prioridades agora'), 'AGORA: sem prioridades');
check(!tem(colab, 'Base da operação'), 'AGORA: sem base da operação');
check(!tem(colab, 'Por setor · hoje'), 'DIA: sem o comparativo de setores');
check(!tem(colab, 'Comparativo entre lojas'), 'REDE: sem comparativo entre lojas');
check(!tem(colab, 'Tendência') && !tem(colab, 'Registros'), 'SEGMENTO: sem as três lentes');
check(!tem(colab, 'Exportar'), 'SEGMENTO: sem exportação');
check(!tem(colab, 'Execuções do período'), 'SEGMENTO: sem a lista de execuções');
check(!tem(colab, 'Histórico de notificações'), 'SEGMENTO: sem histórico de notificações');
check(!tem(colab, 'Checklists 100%'), 'SEGMENTO: sem o cartão de checklists 100%');
check(!tem(colab, 'Conferido por') && !tem(colab, 'Conferir'), 'AGORA: sem a fila de conferência');

console.log('\n═══ o motor analítico não roda para o colaborador ═══');
// Regressão registrada como dívida da Fase 5 e paga depois: `useRelatorio`
// vivia no corpo da aba e rodava para TODO papel, porque hook não pode ser
// condicional. Passou para um componente que só monta para MANAGER_ROLES.
globalThis.__relCalls = 0;
painel(colaborador);
check(globalThis.__relCalls === 0,
  `useRelatorio NÃO é chamado para colaborador (foi ${globalThis.__relCalls}×)`);
globalThis.__relCalls = 0;
painel(gestor, { canSeeAllUnits: true });
check(globalThis.__relCalls === 1,
  `useRelatorio é chamado exatamente 1× para gestão (foi ${globalThis.__relCalls}×)`);

console.log('\n═══ gestão vê o que o colaborador não vê ═══');
const chefe = painel(gestor, { canSeeAllUnits: true });
check(tem(chefe, 'Prioridades agora'), 'gestão tem o registro AGORA');
check(tem(chefe, 'Base da operação'), 'gestão tem a base da operação');
check(tem(chefe, 'Tendência'), 'gestão tem o segmento analítico');
check(tem(chefe, 'Exportar'), 'gestão tem a exportação');
check(tem(chefe, 'Feito do previsto'), 'gestão também tem o score do dia');

// 18/08/2026 — a fila de conferência saiu do fim do AGORA e virou seção
// própria, com cabeçalho (contagem + "Conferir próxima"). É a superfície de
// trabalho de quem confere; se sumir, a conferência volta a ser invisível.
check(tem(chefe, 'Conferência de checklists'), 'gestão tem a seção CONFERÊNCIA com cabeçalho');
check(tem(chefe, 'aguardando você'), 'o cabeçalho diz quantas rodadas esperam');
check(tem(chefe, 'Conferir próxima'), 'e oferece "Conferir próxima" (há rodada sem conferir na fixture)');
check(!tem(colab, 'Conferência de checklists') && !tem(colab, 'Conferir próxima'),
  'colaborador NÃO vê a seção CONFERÊNCIA');

console.log('\n═══ REDE só para quem enxerga a rede ═══');
// Liderança é presa a uma loja: `canSeeAllUnits` é falso e a seção não existe.
const lideranca = painel(lider);
check(!tem(lideranca, 'Comparativo entre lojas'), 'liderança (presa a uma loja) não vê REDE');
check(tem(lideranca, 'Prioridades agora'), 'liderança vê o AGORA');

await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
