/**
 * A data de ativação da loja (`units.active_from`).
 *
 *   cd ibr-checklists-app && node tests/ativacao-loja.spec.mjs
 *
 * ── O que esta regra promete ─────────────────────────────────────────────────
 *
 * Entre cadastrar a loja e a equipe começar a usar passam dias ou semanas. Até
 * 15/08/2026 esse intervalo contava como operação real: os checklists apareciam
 * no Executar de quem ainda não tinha sido treinado, e cada dia de montagem
 * entrava no Painel como um dia de 0% de aderência. A empresa estreava no ZCheck
 * com um histórico de fracasso que ela nunca viveu.
 *
 * `active_from` corta isso: antes da data nada aparece e nada conta.
 *
 * ── Por que um arquivo de teste, e não uma conferência na tela ───────────────
 *
 * A regra vive em DOIS lugares que não se enxergam: o denominador (previstos) e
 * o numerador (execuções). Acertar só um produz um defeito pior do que o que a
 * regra veio corrigir — zerar o previsto e manter a execução faz a aderência da
 * estreia estourar 100%, e a tela passa a elogiar a loja por um dia em que ela
 * não abriu. Os dois lados são afirmados aqui, juntos (bloco 2).
 *
 * E, como em tests/painel-render.spec.mjs, o portão do PDF é cego para o que
 * importa aqui: "a equipe não vê" é promessa de RENDERIZAÇÃO. Por isso o bloco 3
 * monta o Executar de verdade e afirma o que aparece e o que não aparece.
 *
 * As datas são relativas ao dia de hoje, pelas MESMAS funções do app
 * (`todayStr`/`addDays`): um teste com datas absolutas passaria hoje e viraria
 * ruído amanhã, que é como portão morre.
 */

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
const tem = (html, s) => html.includes(s);

// Mesma montagem de tests/painel-render.spec.mjs — ver o cabeçalho de lá para o
// porquê de cada opção (React externo, loader jsx em .js, banner do require).
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-ativacao');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { unitActiveOn, isUnitActiveOn, isUnitOff } from '${process.cwd()}/lib/checklists.js';
  export { todayStr, addDays } from '${process.cwd()}/lib/dates.js';
  export { useRelatorio } from '${process.cwd()}/components/painel/useRelatorio.js';
  export { buildJit } from '${process.cwd()}/components/painel/JitPanel.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
  export { ExecutarView } from '${process.cwd()}/app/app/page.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const {
  unitActiveOn, isUnitActiveOn, isUnitOff, todayStr, addDays,
  useRelatorio, buildJit, UnitsContext, ExecutarView,
} = await import(out);

// ── Fixtures ────────────────────────────────────────────────────────────────
const TZ = 'America/Sao_Paulo';
const HOJE = todayStr(TZ);
const ONTEM = addDays(HOJE, -1);
const AMANHA = addDays(HOJE, 1);

const loja = (activeFrom, over = {}) => ({
  id: 'u1', name: 'Loja Teste', color: '#8a2be2', sectors: ['Salão'],
  timezone: TZ, activeFrom, ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
// 1 · O predicado
// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ unitActiveOn — o corte entre montar e operar ═══');

check(unitActiveOn(loja(null), ONTEM) === true,
  'loja SEM data conta desde sempre — o parque existente não muda de sentido');
check(unitActiveOn(loja(undefined), '1999-01-01') === true,
  'campo ausente também: nulo e undefined são a mesma coisa aqui');
check(unitActiveOn(loja(HOJE), HOJE) === true,
  'o próprio dia da ativação JÁ conta (a comparação é inclusiva)');
check(unitActiveOn(loja(HOJE), ONTEM) === false, 'a véspera não conta');
check(unitActiveOn(loja(HOJE), AMANHA) === true, 'depois conta');
check(unitActiveOn(loja(AMANHA), HOJE) === false,
  'loja com estreia marcada para amanhã ainda não conta hoje');

// O PostgREST devolve `date` como 'YYYY-MM-DD', mas um ajuste manual no banco ou
// uma importação podem deixar um timestamp na coluna. Cortar em 10 evita que
// '…T00:00:00' > 'YYYY-MM-DD' e a loja perca o próprio dia de estreia.
check(unitActiveOn({ activeFrom: `${HOJE}T00:00:00+00:00` }, HOJE) === true,
  'timestamp na coluna não rouba o dia da estreia');

check(isUnitActiveOn([loja(AMANHA)], 'u1', HOJE) === false, 'resolve a loja pelo id na lista');
check(isUnitActiveOn([], 'fantasma', HOJE) === true,
  'loja fora da lista conta — dado não some por cadastro incompleto');

console.log('\n═══ isUnitOff — folga e pré-ativação viram o mesmo para quem CONTA ═══');
const folga = [{ unitId: 'u1', date: HOJE }];
check(isUnitOff([loja(null)], folga, 'u1', HOJE) === true, 'folga tira o dia');
check(isUnitOff([loja(AMANHA)], [], 'u1', HOJE) === true, 'pré-ativação tira o dia');
check(isUnitOff([loja(null)], [], 'u1', HOJE) === false, 'dia normal fica');
check(isUnitOff([loja(ONTEM)], [], 'u1', HOJE) === false, 'loja já ativa: dia normal fica');

// ═══════════════════════════════════════════════════════════════════════════
// 2 · As contas — os dois lados da fração
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ o previsto ignora o período de montagem ═══');

const templates = [{
  id: 't1', unitId: 'u1', sector: 'Salão', name: 'Abertura Salão', shift: 'Manhã',
  deadline: '10:00', active: true, createdAt: `${addDays(HOJE, -30)}T09:00:00Z`,
  items: [{ id: 'i1', text: 'Ligar luzes' }, { id: 'i2', text: 'Conferir caixa', critical: true }],
}];
const execucaoEm = date => ({
  id: `c-${date}`, templateId: 't1', unitId: 'u1', sector: 'Salão', date,
  templateName: 'Abertura Salão', operatorName: 'Ana', operatorUserId: 'p1',
  completedAt: `${date}T09:30:00.000Z`,
  items: [{ id: 'i1', done: true }, { id: 'i2', done: true, critical: true }],
});

// `useRelatorio` é um hook: só roda dentro de um render. O harness devolve o
// objeto derivado sem passar pelo JSX de ninguém. O período é o padrão, 7 dias.
const motor = (unidade, completions) => {
  const props = {
    unit: unidade, templates, completions, closures: [],
    users: [{ id: 'p1', name: 'Ana', role: 'colaborador', unitId: 'u1' }],
    canSeeAllUnits: false, allUnitsSelected: false,
    currentUser: { id: 'g1', name: 'Chefe', role: 'gestao', unitId: null },
    onReview: () => {}, disputes: [], onResolveDispute: () => {},
  };
  let capturado = null;
  const Harness = () => { capturado = useRelatorio(props); return null; };
  renderToStaticMarkup(h(UnitsContext.Provider, { value: [unidade] }, h(Harness)));
  return capturado;
};

const relSempre = motor(loja(null), [execucaoEm(HOJE)]);
check(relSempre.expectedChecklists === 7,
  `loja sem data: os 7 dias do período são cobrados (foi ${relSempre.expectedChecklists})`);

// A loja estreia HOJE. O checklist existe há 30 dias, mas até ontem ela ainda
// estava sendo montada: aqueles dias não podem entrar no denominador.
const relEstreia = motor(loja(HOJE), [execucaoEm(HOJE)]);
check(relEstreia.expectedChecklists < relSempre.expectedChecklists,
  'a loja que estreou hoje tem MENOS previsto que a que sempre existiu');
check(relEstreia.expectedChecklists === 1,
  `só o dia da estreia é previsto (foi ${relEstreia.expectedChecklists})`);
check(relEstreia.checklistRate === 100,
  `e a estreia fecha em 100%, não em 14% (foi ${relEstreia.checklistRate})`);

console.log('\n═══ e o numerador acompanha: nada de aderência acima de 100% ═══');
// O outro lado da fração. Se o previsto ignora o dia e a execução não, a conta
// vira 1/0. Quem filtra as execuções é `visibleCompletions` (app/app/page.js);
// aqui a entrada de um caso chega filtrada e a do outro não, para o teste medir
// a diferença que aquele filtro faz em vez de supor que ele existe.
const relComLixo = motor(loja(HOJE), [execucaoEm(HOJE), execucaoEm(ONTEM)]);
check(relComLixo.expectedChecklists === 1,
  'execução gravada durante a montagem não inventa previsto');
check(relComLixo.checklistRate > 100,
  'sem filtrar as execuções a taxa PASSA de 100% — é isto que `visibleCompletions` evita');
check(relEstreia.checklistRate === 100,
  'com a entrada filtrada os dois lados da fração concordam');

console.log('\n═══ J.I.T.: a loja que ainda não estreou não gera cobrança ═══');
const jitInativa = buildJit([], templates, [], [loja(AMANHA)], 'u1', 'u1');
check(jitInativa.today.expected === 0, 'nada previsto hoje para loja que estreia amanhã');
check(jitInativa.today.overdue === 0, 'e nenhum atrasado — não se cobra o que não apareceu');

const jitAtiva = buildJit([], templates, [], [loja(ONTEM)], 'u1', 'u1');
check(jitAtiva.today.expected > 0, 'loja já ativa segue com previsto — a regra não vaza para quem opera');

// O ranking entre lojas só existe com 2+ lojas e sem escopo fixo. É lá que o
// motivo precisa aparecer separado: "fechada hoje" numa loja que nem estreou
// mandaria a gerência procurar uma folga que ninguém marcou.
const rede = [loja(AMANHA), { ...loja(null), id: 'u2', name: 'Loja Velha' }];
const templatesRede = [...templates, { ...templates[0], id: 't2', unitId: 'u2' }];
const jitRede = buildJit([], templatesRede, [], rede, null, 'u2');
const u1NaRede = jitRede.stores.find(s => s.unitId === 'u1');
const u2NaRede = jitRede.stores.find(s => s.unitId === 'u2');
check(u1NaRede?.naoAtivaAinda === true, 'a loja que não estreou é marcada como "ainda não ativa"');
check(u1NaRede?.expectedToday === 0, 'e não tem previsto hoje');
check(u2NaRede?.naoAtivaAinda === false, 'a loja em operação NÃO é marcada assim');
check(u2NaRede?.expectedToday > 0, 'e segue com o previsto dela');

// ═══════════════════════════════════════════════════════════════════════════
// 3 · A tela — "não conta" e "não aparece" são promessas diferentes
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ Executar: a equipe não vê checklist antes da estreia ═══');

const executar = unidade => renderToStaticMarkup(
  h(UnitsContext.Provider, { value: [unidade] },
    h(ExecutarView, {
      unit: unidade, templates, completions: [], closures: [],
      currentUser: { id: 'p1', name: 'Ana', role: 'colaborador', unitId: 'u1', sectorId: null },
      onSaveCompletion: () => {},
    })));

// O primeiro nível do Executar lista os TIPOS ("Abertura", com "1 atrasado" ao
// lado) — o nome do checklist só aparece depois de escolher um. Por isso a
// asserção é sobre o tipo: é o que a equipe vê ao abrir o app.
const antes = executar(loja(AMANHA));
check(!tem(antes, 'Abertura'),
  'o checklist cadastrado NÃO aparece para a equipe antes da data');
check(!tem(antes, 'atrasado'),
  'e nada é cobrado como atraso — o defeito que a regra veio corrigir');
check(tem(antes, 'começa em'), 'a tela diz que a loja ainda vai começar');
check(tem(antes, new Date(`${AMANHA}T12:00:00`).toLocaleDateString('pt-BR')),
  'e diz a data em pt-BR, sem cair um dia por causa de UTC');
check(tem(antes, 'Gerenciar'),
  'e diz quem resolve, para a data errada não virar chamado de suporte');
check(!tem(antes, 'folga'),
  'não confunde estreia com folga — são estados diferentes e a causa importa');

const depois = executar(loja(addDays(HOJE, -30)));
check(tem(depois, 'Abertura'), 'loja já ativa mostra os checklists normalmente');
check(!tem(depois, 'começa em'), 'e não mostra o aviso de estreia');

const sempre = executar(loja(null));
check(tem(sempre, 'Abertura'),
  'loja sem data mostra tudo — o comportamento de hoje, preservado');

await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
