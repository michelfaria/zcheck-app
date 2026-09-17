/**
 * Marcação ao vivo quita o carryover — sem precisar de "Concluir checklist".
 *
 *   cd ibr-checklists-app && node tests/carryover-marcacao.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * IBR3, 16/09/2026 (quarta): Leonardo e Pamella marcaram as 7 tarefas do
 * "Rotina Sala" na rodada ao vivo (`live_tasks`, 15:06 a 16:57) e ninguém
 * apertou "Concluir checklist". Em 17/09 as tarefas de quarta voltaram como
 * "Pendente desde 16/09" — serviço feito, cobrado de novo, e a equipe reportou
 * como "o app não atualizou o status". A regra de quitação só olhava
 * `completions`; a marcação, que é a prova mais direta de que a tarefa foi
 * feita, não contava.
 *
 * Decisão (Michel, 17/09/2026): marcação ao vivo em D quita a dívida até D,
 * como uma submissão. A aderência NÃO muda — o Painel continua cobrando a
 * entrega do checklist. Este arquivo afirma os dois lados: a tarefa não volta,
 * e o checklist continua não entregue.
 *
 * As datas são as do caso, fixas: a regra não consulta o relógio. Só a última
 * asserção usa `templateStatus`, e ela vale para qualquer hora (não é "done").
 */

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-carryover-marcacao');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { pendenciasArrastadas, itensDoDia, templateStatus, templateProgress } from '${process.cwd()}/lib/checklists.js';
`);
await build({ entryPoints: [entry], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { pendenciasArrastadas, itensDoDia, templateStatus, templateProgress } = await import(out);

// ── Fixture: o Rotina Sala do caso, reduzido ─────────────────────────────────
// 2026-09-14 é SEGUNDA (15 ter, 16 qua, 17 qui).
const SEG = '2026-09-14', TER = '2026-09-15', QUA = '2026-09-16', QUI = '2026-09-17';
const TZ = 'America/Sao_Paulo';
const tpl = {
  id: 'rotina-sala', unitId: 'ibr3', name: 'Rotina Sala (IBR3)', deadline: '18:00',
  items: [
    { id: 'plantas',  text: 'Aguar as plantas',              recurrence: [1, 3, 5], carryover: true, carryoverSince: '2026-08-31' },
    { id: 'lojinha',  text: 'Limpar e reorganizar lojinha',  recurrence: [1, 3],    carryover: true, carryoverSince: '2026-08-31' },
    { id: 'lixeiras', text: 'Lavar lixeiras',                recurrence: [3],       carryover: true, carryoverSince: '2026-08-31' },
    { id: 'vidros',   text: 'Limpeza de vidros' }, // diária, sem flag
  ],
};
const marca = (date, itemId, over = {}) => ({
  templateId: 'rotina-sala', unitId: 'ibr3', date, itemId, done: true,
  completedAt: `${date}T19:30:00Z`, operatorName: 'Leonardo', ...over,
});
const marcasDeQuarta = ['plantas', 'lojinha', 'lixeiras'].map(id => marca(QUA, id));
const ids = list => list.map(x => x.itemId ?? x.id).sort();
// O histórico real da semana: segunda e terça foram entregues (submetidas).
const feita = (date, itemIds) => ({
  id: `c-${date}`, templateId: 'rotina-sala', unitId: 'ibr3', date, completedAt: `${date}T20:00:00Z`,
  items: tpl.items.map(i => ({ id: i.id, done: itemIds.includes(i.id) })),
});
const historico = [feita(SEG, ['plantas', 'lojinha', 'vidros']), feita(TER, ['plantas', 'vidros'])];

console.log('\n1. O caso: sem marcações, quarta volta na quinta (linha de base)');
const semNada = pendenciasArrastadas(tpl, historico, [], QUI, 7, null);
check(ids(semNada).join() === 'lixeiras,lojinha,plantas', 'as três tarefas de quarta viram dívida');
check(semNada.every(d => d.dataOriginal === QUA), 'origem 16/09');
check(itensDoDia(tpl, historico, [], QUI).filter(i => i.carriedFrom).length === 3, 'itensDoDia mostra as três arrastadas');

console.log('\n2. Marcadas em 16/09 sem "Concluir": não voltam em 17/09');
const comMarcas = pendenciasArrastadas(tpl, historico, [], QUI, 7, null, marcasDeQuarta);
check(comMarcas.length === 0, 'pendenciasArrastadas vazia');
const dia = itensDoDia(tpl, historico, [], QUI, 7, null, marcasDeQuarta);
check(dia.every(i => !i.carriedFrom), 'itensDoDia sem nenhuma arrastada');
check(ids(dia).join() === 'vidros', 'sobra só a diária de quinta');

console.log('\n3. Marcação parcial quita só o que foi marcado');
const parcial = pendenciasArrastadas(tpl, historico, [], QUI, 7, null, [marca(QUA, 'plantas')]);
check(ids(parcial).join() === 'lixeiras,lojinha', 'plantas quitada; lojinha e lixeiras seguem devendo');

console.log('\n4. O que NÃO quita');
check(pendenciasArrastadas(tpl, historico, [], QUI, 7, null, marcasDeQuarta.map(m => ({ ...m, done: false }))).length === 3,
  'marcação reaberta (done = false) não conta');
check(pendenciasArrastadas(tpl, historico, [], QUI, 7, null, marcasDeQuarta.map(m => ({ ...m, templateId: 'outro' }))).length === 3,
  'marcação de outro checklist não conta');
check(pendenciasArrastadas(tpl, historico, [], QUI, 7, null, marcasDeQuarta.map(m => ({ ...m, unitId: 'ibr2' }))).length === 3,
  'marcação de outra loja não conta');
check(pendenciasArrastadas(tpl, historico, [], QUI, 7, null, [marca('2026-09-02', 'plantas')]).length === 3,
  'marcação fora da janela de 7 dias não conta');
check(pendenciasArrastadas(tpl, historico, [], QUI, 7, null, [null, {}, marca(QUA, 'plantas', { itemId: null })]).length === 3,
  'entrada nula ou sem itemId não derruba nem quita');

console.log('\n5. Marcar hoje quita a dívida antiga (como fazer hoje quitaria)');
// Plantas de segunda 14/09 não feita; marcada só na quinta 17/09 (hoje).
const hoje = pendenciasArrastadas(tpl, [], [], QUI, 7, null, [marca(QUI, 'plantas'), marca(QUA, 'lojinha'), marca(QUA, 'lixeiras')]);
check(hoje.length === 0, 'nada arrastado: plantas quitada hoje, as outras na quarta');

console.log('\n6. Aderência não muda: o checklist de 16/09 continua NÃO entregue');
const prog = templateProgress(tpl, [], QUA);
check(prog.submissions === 0 && prog.done === 0, 'templateProgress: nenhuma submissão, nada feito');
const st = templateStatus(tpl, historico, QUA, TZ);
check(st !== 'done' && st !== 'partial', `templateStatus de 16/09 sem submissão: "${st}" (não é entrega)`);

console.log('\n7. Submissão continua quitando como antes');
const registro = { id: 'c1', templateId: 'rotina-sala', unitId: 'ibr3', date: QUA, completedAt: `${QUA}T20:00:00Z`,
  items: tpl.items.map(i => ({ id: i.id, done: true })) };
check(pendenciasArrastadas(tpl, [...historico, registro], [], QUI).length === 0, 'registro de 16/09 com tudo feito: sem dívida');

console.log(ok ? '\nOK — carryover-marcacao' : '\nFALHOU — carryover-marcacao');
process.exit(ok ? 0 : 1);
