/**
 * O J.I.T. nomeia e conta o item crítico recorrente do checklist CERTO.
 *
 *   cd ibr-checklists-app && node tests/jit-hotspot.spec.mjs
 *
 * ── O defeito ────────────────────────────────────────────────────────────────
 *
 * O id de um item só é único DENTRO do seu checklist. Os checklists semeados
 * (IBR2_TEMPLATES, IBR3_TEMPLATES e `generateSeedTemplates` em app/app/page.js)
 * usam `i1`, `i2`… em todos. Até 24/09/2026 `buildJit` chaveava o texto do item
 * e o contador de "crítico pendente ≥2× em 7 dias" só pelo id, e isso dava dois
 * erros na mesma loja:
 *
 *   1. a recomendação "Loja X: "<tarefa>" ficou pendente N×" e a Leitura da
 *      operação ("Falha crítica que se repete") podiam nomear a tarefa de OUTRO
 *      checklist — o primeiro template da lista com um `i1` ganhava o nome;
 *   2. dois críticos diferentes com o mesmo id somavam num hotspot só, e o N
 *      saía inflado.
 *
 * Foi visto renderizando o Painel com as fixtures de scripts/landing-shots: a
 * falha da câmara fria da Cozinha aparecia com o nome de uma tarefa de Salão
 * que nem era crítica. As fixtures foram trocadas para ids únicos e deixaram de
 * mostrar o defeito — por isso a prova mora aqui, com o `i1` repetido de
 * propósito, e não num print.
 *
 * `buildJit` é função pura: não precisa de render, sessão nem banco. O bundle
 * existe só porque JitPanel.js é JSX em `.js`.
 */

import { build } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// Mesma montagem de tests/painel-render.spec.mjs — ver o cabeçalho de lá para o
// porquê de cada opção (React externo, loader jsx em .js, banner do require).
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-jit-hotspot');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { todayStr, addDays } from '${process.cwd()}/lib/dates.js';
  export { buildJit } from '${process.cwd()}/components/painel/JitPanel.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { todayStr, addDays, buildJit } = await import(out);

// ── Fixtures ────────────────────────────────────────────────────────────────
// Datas relativas a hoje, pelas MESMAS funções do app: com datas absolutas o
// teste sairia da janela de 7 dias na semana que vem e passaria a provar nada.
const TZ = 'America/Sao_Paulo';
const HOJE = todayStr(TZ);
const unit = { id: 'u1', name: 'Loja Centro', color: '#8a2be2', sectors: ['Salão', 'Cozinha'], timezone: TZ };

const SALAO = 'Ligar o som ambiente do salão';
const CAMARA = 'Conferir temperatura da câmara fria';

// Salão PRIMEIRO de propósito: era o primeiro `i1` da lista que dava nome a
// todos os `i1` da loja.
const templates = [
  {
    id: 't-salao', unitId: 'u1', sector: 'Salão', name: 'Abertura Salão', shift: 'Manhã',
    deadline: '10:00', active: true, createdAt: `${addDays(HOJE, -30)}T09:00:00Z`,
    items: [{ id: 'i1', text: SALAO, critical: true }],
  },
  {
    id: 't-cozinha', unitId: 'u1', sector: 'Cozinha', name: 'Fechamento Cozinha', shift: 'Noite',
    deadline: '23:00', active: true, createdAt: `${addDays(HOJE, -30)}T09:00:00Z`,
    items: [{ id: 'i1', text: CAMARA, critical: true }],
  },
];

const execucao = (t, diasAtras, done, over = {}) => {
  const date = addDays(HOJE, -diasAtras);
  return {
    id: `c-${t.id}-${date}`, templateId: t.id, templateName: t.name, unitId: 'u1',
    sector: t.sector, date, operatorName: 'Ana', operatorUserId: 'p1',
    completedAt: `${date}T12:00:00.000Z`,
    items: [{ id: 'i1', critical: true, done }],
    ...over,
  };
};
const [salao, cozinha] = templates;

const recHotspot = jit => jit.recommendations.filter(r => r.type === 'critical_hotspot');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ só a Cozinha falha: o J.I.T. nomeia a Cozinha ═══');
// A câmara fria fica pendente em 3 dos últimos 7; o som do salão sempre feito.
const soCozinha = [
  execucao(cozinha, 1, false), execucao(cozinha, 2, false), execucao(cozinha, 3, false),
  execucao(salao, 1, true), execucao(salao, 2, true), execucao(salao, 3, true),
];
const jitA = buildJit(soCozinha, templates, [], [unit], 'u1', 'u1');
const recsA = recHotspot(jitA);

check(recsA.length === 1, `uma recomendação de crítico recorrente (foram ${recsA.length})`);
check(recsA[0]?.text.includes(CAMARA),
  `a recomendação nomeia a tarefa que falhou — "${recsA[0]?.text}"`);
check(!recsA[0]?.text.includes(SALAO),
  'e não a tarefa de Salão que divide o id `i1`');
check(/pendente 3×/.test(recsA[0]?.text || ''), 'N é 3');

check(jitA.insight?.type === 'recurring_critical', `a Leitura da operação é a falha recorrente (foi ${jitA.insight?.type})`);
check(jitA.insight?.evidence.includes(CAMARA) && !jitA.insight?.evidence.includes(SALAO),
  'e nomeia a câmara fria, não o salão');
check(/pendente 3×/.test(jitA.insight?.evidence || ''), 'com o mesmo N da recomendação');

check(jitA.criticalTop.length === 1 && jitA.criticalTop[0].text === CAMARA && jitA.criticalTop[0].count === 3,
  `os críticos recorrentes do Painel listam a câmara fria 3× (${JSON.stringify(jitA.criticalTop)})`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ o Salão falha uma vez: não soma na Cozinha ═══');
// Com a chave só pelo id, este `i1` pendente do Salão virava a 4ª falha da
// câmara fria. Uma falha isolada nem chega a ser recorrente.
const comUmaDoSalao = [...soCozinha, execucao(salao, 4, false)];
const jitB = buildJit(comUmaDoSalao, templates, [], [unit], 'u1', 'u1');
const recsB = recHotspot(jitB);

check(recsB.length === 1, `ainda UMA recomendação — o salão 1× não é recorrente (foram ${recsB.length})`);
check(/pendente 3×/.test(recsB[0]?.text || ''),
  `N segue 3, não 4 — "${recsB[0]?.text}"`);
check(recsB[0]?.text.includes(CAMARA), 'e segue nomeando a câmara fria');
check(jitB.criticalTop.length === 1 && jitB.criticalTop[0].count === 3,
  'a lista do Painel também não soma os dois checklists');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ os dois falham: dois hotspots, cada um com o seu nome ═══');
const osDois = [...soCozinha.filter(c => c.templateId === 't-cozinha'),
  execucao(salao, 1, false), execucao(salao, 2, false)];
const jitC = buildJit(osDois, templates, [], [unit], 'u1', 'u1');
const recsC = recHotspot(jitC);

check(recsC.length === 2, `duas recomendações, uma por checklist (foram ${recsC.length})`);
check(recsC[0]?.text.includes(CAMARA) && /pendente 3×/.test(recsC[0].text),
  `a mais frequente primeiro: câmara fria 3× — "${recsC[0]?.text}"`);
check(recsC[1]?.text.includes(SALAO) && /pendente 2×/.test(recsC[1].text),
  `depois o salão 2× — "${recsC[1]?.text}"`);
check(new Set(recsC.map(r => r.id)).size === 2,
  'com ids distintos — o id vai para `action_plans.rec_id`, e o "No plano" de um não pode marcar o outro');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ execução sem templateId: cai no nome e no texto gravado ═══');
// Registros antigos não têm `templateId` (lib/rounds.js já agrupa pelo nome).
// Sem template para consultar, o texto que a própria execução gravou nomeia.
const legado = [1, 2].map(d => execucao(cozinha, d, false, {
  templateId: null, items: [{ id: 'i1', critical: true, done: false, text: 'Texto gravado na execução' }],
}));
const jitD = buildJit(legado, templates, [], [unit], 'u1', 'u1');
const recsD = recHotspot(jitD);
check(recsD.length === 1 && recsD[0].text.includes('Texto gravado na execução') && /pendente 2×/.test(recsD[0].text),
  `nomeia pelo texto da execução — "${recsD[0]?.text}"`);
check(!recsD[0]?.text.includes(SALAO), 'e não herda o nome do primeiro `i1` da lista');

await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
