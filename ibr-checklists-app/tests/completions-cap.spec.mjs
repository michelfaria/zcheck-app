/**
 * O teto da lista de conclusões em memória — corta o lado certo?
 *
 *   cd ibr-checklists-app && node tests/completions-cap.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Vídeo do IBR3, 11/09/2026: o operador fecha o checklist de Caixa com 100%,
 * aperta "Concluir", volta para a lista — e Praça de Alimentos, Praça de
 * Bebidas e Sala, feitos às 08:14, aparecem ATRASADO. Ao recarregar, os quatro
 * voltam a CONCLUÍDO. Parecia sincronização; era o corte da lista.
 *
 * `fetchCompletions` entrega até 1000 linhas do MAIS NOVO para o mais velho. O
 * app fazia `[...prev, record].slice(-500)`: acrescentava no fim e ficava com os
 * 500 últimos — que, nessa ordem, são os mais ANTIGOS. Com mais de 500 linhas
 * carregadas (três lojas enchem isso em duas semanas), cada submissão apagava
 * da memória as conclusões de hoje. Só a recém-submetida sobrevivia.
 *
 * O bloco 1 reproduz o defeito com a fixture — para provar que a fixture é
 * realista, não para manter o comportamento. Os blocos seguintes afirmam a
 * regra nova: `capCompletions` descarta pelo tempo, e a tela continua dizendo
 * "done" para o que foi feito hoje. A régua é a mesma da tela: `templateStatus`.
 *
 * O dia da cena é ONTEM, pelas funções do app: o prazo (08:00) já venceu em
 * qualquer hora em que o teste rode, então "sem conclusão" é sempre `overdue`.
 */

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// `lib/checklists.js` importa sem extensão (é código do Next) — passa pelo
// esbuild como nos outros specs. `lib/completions.js` não importa nada, mas
// entra no mesmo bundle para o teste provar o módulo que o app consome.
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-completions-cap');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { capCompletions, COMPLETIONS_HORIZON } from '${process.cwd()}/lib/completions.js';
  export { templateStatus } from '${process.cwd()}/lib/checklists.js';
  export { todayStr, addDays } from '${process.cwd()}/lib/dates.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', logLevel: 'silent',
});
const { capCompletions, COMPLETIONS_HORIZON, templateStatus, todayStr, addDays } = await import(out);

// ── Fixture: três lojas, 12 checklists por dia cada, 90 dias ────────────────
const TZ = 'America/Sao_Paulo';
const DIA = addDays(todayStr(TZ), -1);
const LOJAS = ['ibr1', 'ibr2', 'ibr3'];
const TIPOS = ['Abertura', 'Rotina', 'Fechamento'];
const SETORES = ['Caixa', 'Pca Alimentos', 'Pca Bebidas', 'Sala'];

const itens = n => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, text: `Tarefa ${i + 1}` }));
const templates = [];
for (const loja of LOJAS) for (const tipo of TIPOS) for (const setor of SETORES) {
  templates.push({
    id: `${loja}-${tipo}-${setor}`.toLowerCase().replace(/\s+/g, '-'),
    unitId: loja, sector: setor, name: `${tipo} ${setor} (${loja.toUpperCase()})`,
    deadline: '08:00', items: itens(setor === 'Caixa' ? 14 : 7),
  });
}
const feito = (t, date, hora) => ({
  id: `${t.id}@${date}`, templateId: t.id, templateName: t.name, unitId: t.unitId, sector: t.sector,
  date, completedAt: `${date}T${hora}:00.000-03:00`, operatorName: 'Luiz',
  items: t.items.map(i => ({ ...i, done: true })),
});

// 90 dias × 36 checklists = 3240 conclusões; o fetch traz as 1000 mais novas,
// da mais recente para a mais antiga — exatamente como `fetchCompletions`.
const todas = [];
for (let d = 0; d < 90; d++) {
  const date = addDays(DIA, -d);
  templates.forEach((t, k) => todas.push(feito(t, date, `08:${String(10 + (k % 40)).padStart(2, '0')}`)));
}
const prev = todas
  .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
  .slice(0, COMPLETIONS_HORIZON);
const deHoje = prev.filter(c => c.date === DIA);

const caixa = templates.find(t => t.id === 'ibr3-abertura-caixa');
const alimentos = templates.find(t => t.id === 'ibr3-abertura-pca-alimentos');
const sala = templates.find(t => t.id === 'ibr3-abertura-sala');

// Leonardo reabre Caixa às 09:55 e submete de novo (o vídeo).
const novo = { ...feito(caixa, DIA, '09:55'), id: 'reexecucao-caixa', operatorName: 'Leonardo' };

console.log('\n1. A fixture reproduz o defeito (corte posicional, como era)');
check(prev.length === COMPLETIONS_HORIZON, `${COMPLETIONS_HORIZON} conclusões carregadas, mais nova primeiro`);
check(deHoje.length === 36, `36 conclusões do dia (${DIA}) no topo da lista`);
check(templateStatus(alimentos, prev, DIA, TZ) === 'done', 'antes de submeter: Pca Alimentos está "done"');
const bugado = [...prev, novo].slice(-500);
check(templateStatus(caixa, bugado, DIA, TZ) === 'done', 'slice(-500): Caixa (recém-submetido) fica "done"');
check(templateStatus(alimentos, bugado, DIA, TZ) === 'overdue', 'slice(-500): Pca Alimentos vira "overdue" — o defeito do vídeo');
check(bugado.filter(c => c.date === DIA).length === 1, 'slice(-500): só a recém-submetida sobrevive do dia');

console.log('\n2. capCompletions descarta pelo TEMPO — hoje sobrevive inteiro');
const depois = capCompletions([...prev, novo]);
check(depois.length === COMPLETIONS_HORIZON, `continua com ${COMPLETIONS_HORIZON} conclusões`);
check(depois.filter(c => c.date === DIA).length === 37, 'as 36 do dia + a reexecução estão todas lá');
check(templateStatus(caixa, depois, DIA, TZ) === 'done', 'Caixa: "done"');
check(templateStatus(alimentos, depois, DIA, TZ) === 'done', 'Pca Alimentos: continua "done"');
check(templateStatus(sala, depois, DIA, TZ) === 'done', 'Sala: continua "done"');
const ids = new Set(depois.map(c => c.id));
const descartadas = [...prev, novo].filter(c => !ids.has(c.id));
const maisAntigaQueFicou = Math.min(...depois.map(c => Date.parse(c.completedAt)));
check(descartadas.length === 1, 'saiu exatamente uma conclusão');
check(descartadas.every(c => Date.parse(c.completedAt) <= maisAntigaQueFicou), 'a que saiu é a mais antiga da lista');
check(depois[0].id === prev[0].id && depois[depois.length - 1].id === novo.id, 'ordem relativa preservada (novo continua no fim)');

console.log('\n3. Idempotente por id, e lista curta passa intacta');
const denovo = capCompletions([...depois, novo]);
check(denovo.length === COMPLETIONS_HORIZON, 'salvar o mesmo registro duas vezes não cresce a lista');
check(denovo.filter(c => c.id === novo.id).length === 1, 'o id repetido aparece uma vez só');
const curta = capCompletions([prev[5], prev[3]]);
check(curta.length === 2 && curta[0].id === prev[5].id, 'abaixo do teto: nada é descartado nem reordenado');
check(capCompletions(null).length === 0 && capCompletions([null, prev[0]]).length === 1, 'null e entradas vazias não derrubam');

console.log('\n4. Sem completedAt vale o dia; sem nada, é a mais antiga');
const semHora = { id: 'sem-hora', templateId: 'x', unitId: 'ibr1', date: addDays(DIA, -95), items: [] };
const semNada = { id: 'sem-nada', templateId: 'x', unitId: 'ibr1', items: [] };
const c4 = capCompletions([semHora, semNada, ...prev], COMPLETIONS_HORIZON);
check(!c4.some(c => c.id === 'sem-nada') && !c4.some(c => c.id === 'sem-hora'), 'as duas saem antes de qualquer conclusão datada');

console.log(ok ? '\nOK — completions-cap' : '\nFALHOU — completions-cap');
process.exit(ok ? 0 : 1);
