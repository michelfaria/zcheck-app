/**
 * Tarefa reprovada tira o checklist do 100%.
 *
 *   cd ibr-checklists-app && node tests/conclusao-reprovada.spec.mjs
 *
 * ── O que a regra promete (decisão de 24/09/2026) ────────────────────────────
 *
 * A equipe marca 8 de 8, a liderança reprova uma na conferência: o checklist
 * NÃO conta como executado 100%. Vale para toda MEDIÇÃO — aderência,
 * "Checklists 100%", status e taxa do Painel, "feito do entregue", J.I.T.,
 * índices — a partir do corte da conferência (`CONFERENCIA_CUTOFF`).
 *
 * E não vale para a EXECUÇÃO: a tela de quem executa, o "Concluir" e o
 * carryover seguem olhando `i.done`. Reprovar não desmarca a tarefa nem a
 * devolve para a lista de ninguém. Esse lado é o que mais fácil quebraria em
 * silêncio — um `descontaReprovadas` virando padrão faria o Executar mostrar
 * "parcial" num checklist que a pessoa vê inteiro marcado — por isso é
 * afirmado aqui (bloco 1).
 *
 * A EXCEÇÃO é o índice da liderança (bloco 4, decisão do mesmo dia): a
 * aderência da equipe é 30% da nota de quem confere, e se a reprovação
 * descontasse ali, reprovar baixaria a nota de quem reprovou.
 *
 * O bloco 3 renderiza o Painel de verdade: "Parcial" com o motivo ao lado é
 * promessa de TELA, e o cálculo sozinho não a prova.
 */

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
const tem = (html, s) => html.includes(s);

// Mesma montagem de tests/painel-render.spec.mjs — ver o cabeçalho de lá.
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-conclusao-reprovada');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { tarefaFeita, verdictInForce } from '${process.cwd()}/lib/conferencia.js';
  export { roundIsComplete, roundProgress, statusFromProgress } from '${process.cwd()}/lib/rounds.js';
  export { completeRoundChecker } from '${process.cwd()}/lib/checklists.js';
  export { summarizeCompletions, collaboratorStats } from '${process.cwd()}/lib/stats.js';
  export { todayStr } from '${process.cwd()}/lib/dates.js';
  export { PainelConsolidado } from '${process.cwd()}/components/painel/PainelConsolidado.js';
  export { buildJit } from '${process.cwd()}/components/painel/JitPanel.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
  export { computeLeadershipProfile } from '${process.cwd()}/app/app/page.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const {
  tarefaFeita, roundIsComplete, roundProgress, completeRoundChecker,
  summarizeCompletions, collaboratorStats, todayStr, PainelConsolidado, buildJit, UnitsContext,
  computeLeadershipProfile,
} = await import(out);

// ── Fixtures ────────────────────────────────────────────────────────────────
const TZ = 'America/Sao_Paulo';
const HOJE = todayStr(TZ);
const DEPOIS = new Date().toISOString();            // julgado agora: vale
const ANTES = '2026-09-20T12:00:00.000Z';           // julgado antes do corte

const unit = { id: 'u1', name: 'Loja Teste', color: '#8a2be2', sectors: ['Salão'], timezone: TZ };
const templates = [{
  id: 't1', unitId: 'u1', sector: 'Salão', name: 'Abertura Salão', shift: 'Manhã', active: true,
  items: [{ id: 'a', text: 'Varrer' }, { id: 'b', text: 'Repor estoque', critical: true }, { id: 'c', text: 'Lixo' }],
}];
const rev = (verdict, reviewedAt = DEPOIS) => ({ verdict, reviewedAt, comMotivo: true });
const rodada = (reviews = {}, over = {}) => ({
  id: 'c1', templateId: 't1', templateName: 'Abertura Salão', unitId: 'u1', sector: 'Salão', date: HOJE,
  operatorName: 'Maria', operatorUserId: 'm1', completedAt: `${HOJE}T12:00:00.000Z`,
  items: ['a', 'b', 'c'].map(id => ({
    id, done: true, doneBy: 'm1', doneByName: 'Maria', critical: id === 'b',
    ...(reviews[id] ? { review: reviews[id] } : {}),
  })),
  ...over,
});
const previstas = ['a', 'b', 'c'];
const chave = { templateId: 't1', unitId: 'u1', date: HOJE };

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 1. a régua: medição desconta, execução não ═══');

const limpa = rodada();
const reprovada = rodada({ b: rev('reprovado') });

check(roundIsComplete(limpa, previstas), 'marcado inteiro, sem conferência: completo');
check(!roundIsComplete(reprovada, previstas),
  'marcado inteiro com uma reprovada: NÃO é entrega completa');
check(roundIsComplete(rodada({ b: rev('ressalva') }), previstas),
  'ressalva não tira o 100% — o trabalho foi entregue, com observação');
check(roundIsComplete(rodada({ b: rev('reprovado', ANTES) }), previstas),
  'reprovada ANTES do corte não reescreve o passado: continua completo');

const medido = roundProgress([reprovada], chave, previstas, { descontaReprovadas: true });
check(medido.done === 2 && medido.total === 3 && medido.reprovadas === 1,
  `Painel: 2 de 3, com 1 reprovada (${medido.done}/${medido.total}, ${medido.reprovadas})`);

const executado = roundProgress([reprovada], chave, previstas);
check(executado.done === 3,
  'tela de quem EXECUTA: continua 3 de 3 — reprovar não desmarca a tarefa');

// A reprovação vence a união: outra submissão da rodada trazendo a tarefa
// marcada (sem veredito) não a ressuscita.
const reenvio = rodada({}, { id: 'c0', completedAt: `${HOJE}T11:00:00.000Z` });
check(roundProgress([reenvio, reprovada], chave, previstas, { descontaReprovadas: true }).done === 2,
  'reprovada numa submissão da rodada está reprovada, mesmo que outra a traga marcada');

check(completeRoundChecker(templates)(reprovada) === false,
  'o predicado da aderência / "Checklists 100%" / J.I.T. herda a régua');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 2. "feito do entregue" e crítico pendente ═══');

const sLimpa = summarizeCompletions([limpa]);
const sRepr = summarizeCompletions([reprovada]);
check(sLimpa.doneItems === 3 && sLimpa.criticalPending === 0, 'sem conferência: 3 feitas, 0 crítico pendente');
check(sRepr.doneItems === 2, `crítica reprovada sai do "feito" (${sRepr.doneItems})`);
check(sRepr.criticalPending === 1, 'e volta a ser crítica pendente — ela não foi feita a contento');

const maria = collaboratorStats([reprovada]).find(x => x.key === 'm1');
check(maria.tasksDone === 2 && maria.criticalDone === 0,
  `nível de realização da pessoa também desconta (${maria.tasksDone} tarefas, ${maria.criticalDone} crítica)`);

check(tarefaFeita({ done: false, review: rev('aprovado') }) === false,
  'aprovar uma tarefa não feita não a torna feita');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 3. o Painel mostra "Parcial" e diz por quê ═══');

const gestor = { id: 'g1', name: 'Chefe', role: 'gestao', unitId: null };
const painel = completions => renderToStaticMarkup(
  h(UnitsContext.Provider, { value: [unit] },
    h(PainelConsolidado, {
      unit, templates, completions, closures: [],
      users: [{ id: 'm1', name: 'Maria', role: 'colaborador', unitId: 'u1' }],
      canSeeAllUnits: true, currentUser: gestor,
      jit: buildJit(completions, templates, [], [unit], 'u1', 'u1'),
      actionPlans: [], plansLoaded: true,
      onCreatePlan: () => {}, onCompletePlan: () => {}, onNavigate: () => {},
      allUnitsSelected: false, onReview: () => {}, disputes: [], onResolveDispute: () => {},
    })));

const pLimpa = painel([limpa]);
check(tem(pLimpa, 'Concluído') && tem(pLimpa, '3/3'), 'sem conferência: Concluído, 3/3');
check(!tem(pLimpa, 'reprovada na conferência'), 'e nenhuma menção a reprovação');

const pRepr = painel([reprovada]);
check(tem(pRepr, '2/3'), 'com a reprovada: 2/3');
check(tem(pRepr, 'Parcial'), 'status Parcial, não Concluído');
check(tem(pRepr, '1 reprovada na conferência'),
  'e o motivo ao lado — senão 2/3 depois de todos verem 3/3 parece defeito');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 4. reprovar não pesa no índice da liderança ═══');

const lider = { id: 'l1', name: 'Carla', role: 'lideranca', unitId: 'u1' };
const indiceLider = completions => computeLeadershipProfile({
  completions, templates, closures: [], units: [unit], leader: lider, today: HOJE,
});
const lLimpa = indiceLider([limpa]);
const lRepr = indiceLider([reprovada]);
check(lRepr.doneChecklists === 1 && lRepr.partialChecklists === 0,
  'na aderência da liderança o checklist com reprovada segue entregue completo');
check(lRepr.adherence === lLimpa.adherence && lRepr.index === lLimpa.index,
  `reprovar não muda a aderência nem o índice de quem reprovou (${lLimpa.adherence} = ${lRepr.adherence}, ${lLimpa.index} = ${lRepr.index})`);
check(completeRoundChecker(templates, { descontaReprovadas: false })(reprovada) === true
  && completeRoundChecker(templates)(reprovada) === false,
  'e a exceção é opt-in: sem pedir, a régua desconta');

await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
