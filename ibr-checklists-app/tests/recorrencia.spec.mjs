/**
 * Recorrência PERIÓDICA da tarefa — "todo dia 10", "a cada 3 meses".
 *
 *   cd ibr-checklists-app && node tests/recorrencia.spec.mjs
 *
 * ── O que existe desde 24/09/2026 ────────────────────────────────────────────
 *
 * Até aqui a tarefa só sabia repetir por dia da semana (`item.recurrence`). O
 * produto passou a servir qualquer operação física, e extintor, dedetização,
 * manutenção e caixa d'água são mensais, trimestrais, semestrais. Nasceu
 * `item.period` = { every, unit: 'day'|'week'|'month', start } (lib/recurrence.js),
 * sem tocar no formato antigo.
 *
 * ── O que este arquivo trava ─────────────────────────────────────────────────
 *
 *  1. A regra: mês curto cai no último dia sem derivar, nada antes de `start`,
 *     `period` inválido cai no dia da semana, e o dado antigo não muda.
 *  2. OS DOIS LADOS DA FRAÇÃO. A periódica nasce cobrando no dia seguinte, e a
 *     rodada que só quita tarefa arrastada acontece num dia em que o checklist
 *     NÃO era previsto. Se o numerador a conta e o denominador não, a aderência
 *     passa de 100% — o defeito de tests/ativacao-loja.spec.mjs, por outro
 *     caminho. Previsto e entregue passam pela mesma `templatePrevistoEm`.
 *  3. O relógio é o DA LOJA, e a regra não lê o fuso do aparelho: o arquivo
 *     roda com o processo em UTC+14 de propósito.
 *  4. O CSV (coluna `dias`) e a TELA — editor e selo na execução —, porque build
 *     limpo não prova que a tela renderiza (ver CLAUDE.md).
 */

// Fuso do APARELHO absurdo de propósito (Kiribati, UTC+14): a regra é
// aritmética de string, e nenhuma data aqui pode depender dele.
process.env.TZ = 'Pacific/Kiritimati';

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// Mesma montagem de tests/ativacao-loja.spec.mjs (React externo, `.js` como
// JSX, `require` de verdade para o build CJS do lucide-react).
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-recorrencia');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export * from '${process.cwd()}/lib/recurrence.js';
  export { applicableItems, templatePrevistoEm, completeRoundChecker, rodadaPrevistaChecker, itensDoDia, pendenciasArrastadas } from '${process.cwd()}/lib/checklists.js';
  export { countApplicableTemplatesOnDate } from '${process.cwd()}/lib/stats.js';
  export { todayStr, addDays, dateStrOf } from '${process.cwd()}/lib/dates.js';
  export { parseCsvDias, parseImportCSV, buildModelCsv } from '${process.cwd()}/lib/csvImport.js';
  export { useRelatorio } from '${process.cwd()}/components/painel/useRelatorio.js';
  export { buildJit } from '${process.cwd()}/components/painel/JitPanel.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
  export { default as RecurrenceEditor } from '${process.cwd()}/components/RecurrenceEditor.js';
  export { ExecutionScreen } from '${process.cwd()}/app/app/page.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const R = await import(out);
const {
  recorrenciaVale, periodoValido, inicioNoDiaDoMes, proximasOcorrencias, descreverRecorrencia, modoRecorrencia,
  applicableItems, templatePrevistoEm, completeRoundChecker, rodadaPrevistaChecker, itensDoDia, pendenciasArrastadas,
  countApplicableTemplatesOnDate, todayStr, addDays, dateStrOf,
  parseCsvDias, parseImportCSV, buildModelCsv,
  useRelatorio, buildJit, UnitsContext, RecurrenceEditor, ExecutionScreen,
} = R;

const mensal = (start, every = 1) => ({ every, unit: 'month', start });
const vale = (period, d, extra = {}) => recorrenciaVale({ period, ...extra }, d);

// ═══════════════════════════════════════════════════════════════════════════
// 1 · A regra
// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ o formato antigo não muda ═══');
// 2026-09-21 é SEGUNDA.
check(recorrenciaVale({ recurrence: [1, 3, 5] }, '2026-09-21') && !recorrenciaVale({ recurrence: [1, 3, 5] }, '2026-09-22'),
  'dia da semana: [1,3,5] vale na segunda e não na terça');
check(recorrenciaVale({}, '2026-09-22') && recorrenciaVale({ recurrence: [] }, '2026-09-22') && recorrenciaVale({ recurrence: null }, '2026-09-22'),
  'sem recorrência (ausente, vazia ou null) = todos os dias');

console.log('\n═══ todo dia N do mês ═══');
const dia10 = mensal('2026-10-10');
check(vale(dia10, '2026-10-10') && vale(dia10, '2026-11-10') && vale(dia10, '2027-01-10'), 'vale todo dia 10, atravessando o ano');
check(!vale(dia10, '2026-10-11') && !vale(dia10, '2026-10-09'), 'e só no dia 10');
check(!vale(dia10, '2026-09-10'), 'nada antes do início — configurar hoje não cria previsto no passado');

const dia31 = mensal('2026-10-31');
check(vale(dia31, '2026-11-30') && !vale(dia31, '2026-11-29'), 'dia 31 em mês de 30 dias cai no dia 30');
check(vale(dia31, '2027-02-28') && vale(dia31, '2028-02-29'), 'em fevereiro, no último dia — 28, ou 29 no bissexto');
check(vale(dia31, '2027-03-31') && !vale(dia31, '2027-03-28'),
  'e volta ao 31 em março: a conta sai do início, nunca da ocorrência anterior (sem deriva para o 28)');

console.log('\n═══ a cada N semanas / meses / dias ═══');
const tri = mensal('2026-10-10', 3);
check(vale(tri, '2026-10-10') && vale(tri, '2027-01-10') && vale(tri, '2027-04-10'), 'a cada 3 meses: 10/10, 10/01, 10/04');
check(!vale(tri, '2026-11-10') && !vale(tri, '2026-12-10'), 'e não nos meses do meio');
const quinz = { every: 2, unit: 'week', start: '2026-09-28' };
check(vale(quinz, '2026-09-28') && vale(quinz, '2026-10-12') && !vale(quinz, '2026-10-05'), 'a cada 2 semanas, no dia da semana do início');
check(!vale(quinz, '2026-09-14'), 'semana também não vale antes do início');
const d15 = { every: 15, unit: 'day', start: '2026-10-01' };
check(vale(d15, '2026-10-16') && vale(d15, '2026-10-31') && !vale(d15, '2026-10-17'), 'a cada 15 dias');

console.log('\n═══ precedência e lixo ═══');
check(vale(dia10, '2026-10-10', { recurrence: [0] }) && !vale(dia10, '2026-10-11', { recurrence: [0] }),
  '`period` válido manda — o `recurrence` ao lado é ignorado');
const lixos = [
  { every: 1, unit: 'year', start: '2026-10-10' },
  { every: 0, unit: 'day', start: '2026-10-10' },
  { every: 1, unit: 'month', start: '2026-02-30' },
  { every: 1.5, unit: 'month', start: '2026-10-10' },
  { every: 1, unit: 'month' },
  'mensal', null,
];
check(lixos.every(p => !periodoValido(p)), '`period` inválido é reconhecido (unidade, every, data impossível, formato)');
check(lixos.every(p => recorrenciaVale({ period: p, recurrence: [2] }, '2026-09-22') && !recorrenciaVale({ period: p, recurrence: [2] }, '2026-09-21')),
  'e cai no dia da semana — nunca some a tarefa por um dado estragado');

console.log('\n═══ início de "todo dia N" ═══');
check(inicioNoDiaDoMes(10, '2026-09-24') === '2026-10-10', 'dia 10 escolhido em 24/09 começa em 10/10');
check(inicioNoDiaDoMes(24, '2026-09-24') === '2026-09-24', 'o dia de hoje começa hoje');
check(inicioNoDiaDoMes(31, '2026-09-24') === '2026-10-31',
  'dia 31 em setembro começa em 31/10 — ancorar em 30/09 faria a tarefa cair no dia 30 para sempre');
check(inicioNoDiaDoMes(30, '2027-02-01') === '2027-03-30', 'dia 30 em fevereiro pula para março');
check(inicioNoDiaDoMes(32, '2026-09-24') === null && inicioNoDiaDoMes(0, '2026-09-24') === null, 'dia fora de 1…31 é recusado');

console.log('\n═══ "Próximas" bate com a regra ═══');
// A prévia do editor é uma conta separada (salta direto para a ocorrência);
// aqui ela é comparada com a força bruta da própria regra, dia a dia.
const cardapio = [
  {}, { recurrence: [1, 3] }, { period: dia10 }, { period: dia31 }, { period: tri },
  { period: mensal('2026-02-28', 12) }, { period: quinz }, { period: d15 },
];
const bruta = (item, desde, n) => {
  const r = [];
  for (let d = desde; r.length < n; d = addDays(d, 1)) if (recorrenciaVale(item, d)) r.push(d);
  return r;
};
const desdes = ['2026-01-15', '2026-09-24', '2026-10-10', '2026-10-11', '2026-12-31', '2027-02-27', '2028-02-28'];
check(cardapio.every(item => desdes.every(d => proximasOcorrencias(item, d, 3).join() === bruta(item, d, 3).join())),
  `as 3 próximas datas batem com a regra em ${cardapio.length} tarefas × ${desdes.length} pontos de partida`);

console.log('\n═══ o texto ═══');
check(descreverRecorrencia({ period: dia10 }, { curta: true }) === 'Todo dia 10', 'selo: "Todo dia 10"');
check(descreverRecorrencia({ period: tri }, { curta: true }) === 'A cada 3 meses', 'selo: "A cada 3 meses"');
check(descreverRecorrencia({ period: tri }) === 'A cada 3 meses, no dia 10, desde 10/10/2026', 'longa diz o dia e desde quando');
check(descreverRecorrencia({ period: quinz }) === 'A cada 2 semanas, às segundas, desde 28/09/2026', 'semana diz o dia da semana');
check(descreverRecorrencia({ recurrence: [1, 3, 5] }, { curta: true }) === 'Seg/Qua/Sex', 'dia da semana segue "Seg/Qua/Sex"');
check(descreverRecorrencia({}) === 'Todos os dias' && descreverRecorrencia({}, { curta: true }) === null,
  'diária: "Todos os dias" no editor e SEM selo na execução');
check(modoRecorrencia({ period: dia10 }) === 'mes' && modoRecorrencia({ period: tri }) === 'intervalo'
  && modoRecorrencia({ recurrence: [2] }) === 'semana' && modoRecorrencia({}) === 'diaria',
  'o modo do editor sai do dado');

// ═══════════════════════════════════════════════════════════════════════════
// 2 · Os dois lados da fração
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ previsto e entregue andam juntos (datas fixas) ═══');
const mes = {
  id: 'mes', unitId: 'u1', sector: 'Salão', name: 'Manutenção mensal', shift: ['Manhã', 'Tarde'], deadline: '18:00',
  items: [{ id: 'extintor', text: 'Conferir extintores', period: dia10, carryover: true, carryoverSince: '2026-10-10' }],
};
const diaria = {
  id: 'dia', unitId: 'u1', sector: 'Salão', name: 'Rotina Salão', shift: 'Manhã', deadline: '18:00',
  items: [{ id: 'chao', text: 'Lavar o chão' }],
};
const rodada = (t, date, ids) => ({
  id: `${t.id}-${date}`, templateId: t.id, unitId: 'u1', sector: 'Salão', date,
  templateName: t.name, operatorName: 'Ana', operatorUserId: 'p1',
  completedAt: `${date}T15:00:00Z`, items: ids.map(id => ({ id, done: true })),
});
const f = { unitId: 'u1' };
check(countApplicableTemplatesOnDate([mes, diaria], f, '2026-10-10') === 2, 'no dia 10 são 2 checklists previstos');
check(countApplicableTemplatesOnDate([mes, diaria], f, '2026-10-11') === 1, 'no dia 11, só o diário');

const noDia = rodada(mes, '2026-10-10', ['extintor']);
const atrasada = rodada(mes, '2026-10-11', ['extintor']);
const completa = completeRoundChecker([mes, diaria]);
const prevista = rodadaPrevistaChecker([mes, diaria]);
check(completa(noDia) && prevista(noDia), 'feito no dia 10: entrega completa DO dia 10');
check(!completa(atrasada) && !prevista(atrasada),
  'feito no dia 11 (arrastado): nem completa nem entregue do dia 11 — lá o previsto dele é zero');
check(itensDoDia(mes, [], [], '2026-10-11').some(i => i.id === 'extintor' && i.carriedFrom === '2026-10-10'),
  'mas a equipe VÊ a tarefa no dia 11, com a origem — o trabalho não some');
check(pendenciasArrastadas(mes, [atrasada], [], '2026-10-12').length === 0, 'e fazê-la no dia 11 quita a dívida');
check(pendenciasArrastadas(mes, [], [], '2026-10-18').length === 0 && pendenciasArrastadas(mes, [], [], '2026-10-17').length === 1,
  'esquecida, cobra por 7 dias (teto do horizonte de dados) e sai');

// `appearsIn`: o denominador ignorava, o Executar respeitava.
const soFechamento = {
  id: 'ab', unitId: 'u1', sector: 'Salão', name: 'Salão — Abertura',
  items: [{ id: 'x', text: 'Só no fechamento', appearsIn: ['fechamento'] }],
};
check(applicableItems(soFechamento, '2026-10-10').length === 0 && countApplicableTemplatesOnDate([soFechamento], f, '2026-10-10') === 0,
  '`appearsIn` de outro tipo: nada a executar E nada previsto (antes contava previsto)');
check(!templatePrevistoEm({ ...diaria, createdAt: '2026-10-12T12:00:00Z' }, '2026-10-11'),
  'checklist que ainda não existia não é previsto — a mesma janela de `templateExistedOn`');

console.log('\n═══ Painel e J.I.T. com a entrega arrastada (datas relativas a hoje) ═══');
const TZ = 'America/Sao_Paulo';
const HOJE = todayStr(TZ);
const ONTEM = addDays(HOJE, -1);
const ANTEONTEM = addDays(HOJE, -2);
const loja = { id: 'u1', name: 'Loja Teste', color: '#8a2be2', sectors: ['Salão'], timezone: TZ };
const criado = `${addDays(HOJE, -30)}T09:00:00Z`;
const mesRel = {
  ...mes, createdAt: criado,
  items: [{ ...mes.items[0], period: mensal(ANTEONTEM), carryoverSince: ANTEONTEM }],
};
const diariaRel = { ...diaria, createdAt: criado };
const tpls = [mesRel, diariaRel];
// Ninguém fez o extintor no dia dele (anteontem). Ontem ele voltou arrastado e
// foi feito — o checklist mensal foi ENTREGUE num dia em que não era previsto.
const execs = [rodada(mesRel, ONTEM, ['extintor']), rodada(diariaRel, ONTEM, ['chao'])];

const jit = buildJit(execs, tpls, [], [loja], 'u1', 'u1');
check(jit.yesterday.expected === 1, `ontem só o diário era previsto (foi ${jit.yesterday.expected})`);
check(jit.yesterday.adherence === 100, `aderência de ontem 100%, não 200% (foi ${jit.yesterday.adherence})`);
check(jit.yesterday.partial === 0, 'e a entrega arrastada não vira "parcial" de ontem');

const motor = completions => {
  const props = {
    unit: loja, templates: tpls, completions, closures: [],
    users: [{ id: 'p1', name: 'Ana', role: 'colaborador', unitId: 'u1' }],
    canSeeAllUnits: false, allUnitsSelected: false,
    currentUser: { id: 'g1', name: 'Chefe', role: 'gestao', unitId: null },
    onReview: () => {}, disputes: [], onResolveDispute: () => {},
  };
  let capturado = null;
  const Harness = () => { capturado = useRelatorio(props); return null; };
  renderToStaticMarkup(h(UnitsContext.Provider, { value: [loja] }, h(Harness)));
  return capturado;
};
const rel = motor(execs);
// 7 dias: o diário todo dia + o mensal no dia dele (anteontem) = 8.
check(rel.expectedChecklists === 8, `previstos no período: 7 do diário + 1 do mensal (foi ${rel.expectedChecklists})`);
check(rel.checklistsEntregues === 1 && rel.checklistsCompletos === 1,
  `entregues e completos contam só o diário de ontem (foram ${rel.checklistsEntregues} e ${rel.checklistsCompletos})`);
check(rel.summary.checklists === 2, 'a entrega arrastada continua no registro — só não é entrega de um dia sem previsto');
const relTudo = motor([...execs, rodada(mesRel, ANTEONTEM, ['extintor'])]);
check(relTudo.checklistsEntregues === 2 && relTudo.checklistRate === 25,
  `feito no dia dele, o mensal conta (2 de 8 = 25%; foi ${relTudo.checklistRate})`);

// ═══════════════════════════════════════════════════════════════════════════
// 3 · O relógio da loja
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ o dia é o do relógio da loja ═══');
// 10/10/2026 03:30 UTC = 00:30 em São Paulo (já é dia 10) = 23:30 em Manaus (ainda dia 9).
const instante = new Date('2026-10-10T03:30:00Z');
const sp = dateStrOf(instante, 'America/Sao_Paulo');
const manaus = dateStrOf(instante, 'America/Manaus');
check(sp === '2026-10-10' && manaus === '2026-10-09', 'o mesmo instante é dia 10 em São Paulo e dia 9 em Manaus');
check(vale(dia10, sp) && !vale(dia10, manaus), 'a tarefa do dia 10 já vale na loja de São Paulo e ainda não na de Manaus');
check(recorrenciaVale({ period: dia10 }, '2026-10-10') && vale(dia31, '2027-02-28'),
  'e a regra não lê o fuso do aparelho (este processo roda em UTC+14)');

// ═══════════════════════════════════════════════════════════════════════════
// 4 · CSV (coluna `dias`)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ CSV: coluna dias ═══');
const HJ = '2026-09-24';
const p = s => parseCsvDias(s, HJ);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check(eq(p('seg qua sex'), { recurrence: [1, 3, 5] }) && eq(p('Segunda-feira, quarta e SEXTA'), { recurrence: [1, 3, 5] }),
  '"seg qua sex" como sempre, e agora também por extenso');
check(eq(p(''), {}) && eq(p('todos os dias'), {}), 'vazio ou "todos os dias" = todos os dias');
check(eq(p('dia 10'), { period: mensal('2026-10-10') }) && eq(p('Todo dia 10 do mês'), { period: mensal('2026-10-10') }),
  '"dia 10" = todo dia 10, começando no próximo dia 10');
check(eq(p('a cada 3 meses desde 10/10/2026'), { period: mensal('2026-10-10', 3) }), '"a cada 3 meses desde 10/10/2026"');
check(eq(p('a cada 2 semanas a partir de 2026-09-28'), { period: quinz }), '"a partir de" e data ISO também');
check(eq(p('trimestral'), { period: mensal(HJ, 3) }) && eq(p('anual desde 01/03/27'), { period: mensal('2027-03-01', 12) }),
  'atalhos (trimestral, anual…) — sem "desde", começam no dia da importação');
check(eq(p('a cada 1 ano'), { period: mensal(HJ, 12) }) && eq(p('quinzenal'), { period: { every: 2, unit: 'week', start: HJ } }),
  '"ano" vira 12 meses; quinzenal é a cada 2 semanas');
check(!!p('a cada 3 mese').erro && !!p('seg qua sexy').erro && !!p('mensal desde 31/02/2026').erro && !!p('dia 32').erro,
  'o que não é reconhecido vira erro (antes sumia em silêncio)');

const cab = 'tipo,checklist,loja,setor,tarefa,critico,foto,dias,orientacao,video,link,deadline,arrastar';
const csv = (...linhas) => [cab, ...linhas].join('\n');
const r = parseImportCSV(csv(
  'checklist,Manutenção,Loja SP,Salão,,,,,,,,18:00,',
  'tarefa,Manutenção,Loja SP,Salão,Extintores,,,dia 10,,,,,',
  'tarefa,Manutenção,Loja SP,Salão,Caixa d\'água,,,semestral,,,,,nao',
  'tarefa,Manutenção,Loja SP,Salão,Coifa,,,seg qua,,,,,',
  'tarefa,Manutenção,Loja SP,Salão,Dedetização,,,a cada 3 mese,,,,,',
), { hojeDaLoja: nome => (nome === 'Loja SP' ? '2026-10-11' : 'errado') });
const [ext, caixa, coifa, dedet] = r.checklists[0].items;
check(eq(ext.period, mensal('2026-11-10')), 'o início sai do relógio da loja da linha (`hojeDaLoja`), não do aparelho');
check(ext.carryover === true, 'periódica com "arrastar" vazio já vem cobrando no dia seguinte');
check(caixa.carryover === undefined && caixa.period?.every === 6, '"nao" escrito desliga a cobrança');
check(coifa.carryover === undefined && eq(coifa.recurrence, [1, 3]),
  'dia da semana segue sem cobrança por padrão, como antes');
check(!dedet.period && !dedet.recurrence && r.warnings.some(w => w.startsWith('Linha 6:') && w.includes('a cada 3 mese')),
  'texto não reconhecido: aviso com o número da linha, e a tarefa entra para todos os dias');

const modelo = parseImportCSV(buildModelCsv({ loja: 'IBR2', setor: 'Cozinha' }));
const extModelo = modelo.checklists[1].items.find(i => i.text === 'Conferir validade dos extintores');
check(modelo.warnings.length === 0 && extModelo?.period?.unit === 'month' && extModelo.carryover === true,
  'o CSV modelo traz um exemplo mensal e importa sem aviso');

// ═══════════════════════════════════════════════════════════════════════════
// 5 · A tela
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ editor: Repetir ═══');
const editor = item => renderToStaticMarkup(h(RecurrenceEditor, { item, accent: '#8a2be2', hoje: '2026-09-24', onChange: () => {} }));
const htmlMes = editor({ id: 'e', text: 'Extintores', period: dia10 });
check(['Todo dia', 'Semana', 'Mês', 'A cada…'].every(l => htmlMes.includes(`>${l}</button>`)), 'os quatro modos aparecem');
check(/aria-pressed="true"[^>]*>Mês</.test(htmlMes), 'e o modo Mês vem marcado para "todo dia 10"');
check(htmlMes.includes('Todo dia 10 do mês') && htmlMes.includes('<option value="10" selected="">10</option>'),
  'título e seletor mostram o dia 10');
check(htmlMes.includes('Próximas: 10/10 · 10/11 · 10/12'), 'a prévia das próximas datas aparece');
check(editor({ id: 'e', text: 'x', period: dia31 }).includes('Em mês mais curto, cai no último dia.') && !htmlMes.includes('mês mais curto'),
  'dia 29 a 31 avisa do mês curto; dia 10 não');
const htmlTri = editor({ id: 'e', text: 'Dedetização', period: mensal('2026-10-10', 3) });
check(htmlTri.includes('value="3"') && htmlTri.includes('value="2026-10-10"') && htmlTri.includes('>meses</option>'),
  '"A cada": número, unidade e data de início');
check(htmlTri.includes('Próximas: 10/10 · 10/01/2027 · 10/04/2027'), 'a prévia mostra o ano quando ele muda');
const htmlSemana = editor({ id: 'e', text: 'Coifa', recurrence: [1, 3] });
check(htmlSemana.includes('Apenas: Seg, Qua') && !htmlSemana.includes('Próximas'), 'dia da semana: os botões de sempre, sem prévia');

console.log('\n═══ execução: o selo ═══');
const hojeDia = Number(HOJE.slice(8, 10));
const exec = renderToStaticMarkup(h(ExecutionScreen, {
  unit: { ...loja, sectors: ['Salão'] }, currentUser: { id: 'p1', name: 'Ana' },
  template: { id: 'mm', unitId: 'u1', sector: 'Salão', name: 'Manutenção mensal', deadline: '18:00',
    items: [{ id: 'ext', text: 'Conferir extintores', period: mensal(HOJE) }, { id: 'nunca', text: 'Não é hoje', period: mensal(addDays(HOJE, 1)) }] },
  completions: [], closures: [],
  onCancel: () => {}, onComplete: () => {}, onDone: () => {},
}));
check(exec.includes('Conferir extintores') && exec.includes(`Todo dia ${hojeDia}`), `a tarefa de hoje aparece com o selo "Todo dia ${hojeDia}"`);
check(!exec.includes('Não é hoje'), 'a que começa amanhã não aparece hoje');

await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
