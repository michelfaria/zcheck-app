/**
 * Teste da migration 20260729_live_tasks_colaborativo.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260729_live_tasks_colaborativo.test.mjs
 *
 * Ver o cabeçalho de 20260726_data_local_brasilia.test.mjs para o porquê do
 * PGlite. Aqui ele importa ainda mais: o valor da migration é a ATOMICIDADE do
 * claim, e isso não dá para conferir lendo o SQL.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260729_live_tasks_colaborativo.sql', import.meta.url)),
  'utf8',
);

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

// Tabela como está em produção (0003_live_tasks.sql + company_id do tenant_01).
await db.exec(`
  create table public.live_tasks (
    template_id      text not null,
    unit_id          text not null,
    date             text not null,
    item_id          text not null,
    done             boolean not null default false,
    operator_user_id text,
    operator_name    text,
    completed_at     timestamptz,
    reopened_count   int not null default 0,
    updated_at       timestamptz not null default now(),
    company_id       text,
    primary key (template_id, unit_id, date, item_id)
  );
`);

console.log('═══ live_tasks colaborativo ═══');
await db.exec(MIGRATION);

const HOJE = (await db.query(`select to_char(current_date, 'YYYY-MM-DD') as d`)).rows[0].d;
const chave = (item) => `'t1','u1','${HOJE}','${item}'`;

// ── Claim ────────────────────────────────────────────────────────────────────
const ana = await db.query(`select * from public.claim_live_task(${chave('i1')},'ana','Ana')`);
check(ana.rows[0].claimed === true, 'quem chega primeiro leva a tarefa');
check(ana.rows[0].operator_name === 'Ana', 'a tarefa fica no nome de quem marcou');

const bruno = await db.query(`select * from public.claim_live_task(${chave('i1')},'bru','Bruno')`);
check(bruno.rows[0].claimed === false, 'o segundo NÃO sobrescreve — claimed = false');
check(bruno.rows[0].operator_name === 'Ana', 'e recebe o dono real para avisar na tela');

// Reivindicar de novo o que já é seu é no-op, não erro.
const anaDeNovo = await db.query(`select * from public.claim_live_task(${chave('i1')},'ana','Ana')`);
check(anaDeNovo.rows[0].claimed === false && anaDeNovo.rows[0].done === true,
  'reivindicar o que já é seu é no-op (segue concluída)');

// ── Evidência ────────────────────────────────────────────────────────────────
await db.query(`select public.set_live_task_evidence(${chave('i2')}, 'freezer em 2 graus', null)`);
const soNota = await db.query(`select done, note from public.live_tasks where item_id = 'i2'`);
check(soNota.rows[0].done === false, 'anexar evidência não conclui a tarefa');
check(soNota.rows[0].note === 'freezer em 2 graus', 'a observação fica na rodada, visível para todos');

await db.query(`select public.set_live_task_evidence(${chave('i2')}, null, 'rodada/t1/u1/i2.jpg')`);
const comFoto = await db.query(`select note, photo_path from public.live_tasks where item_id = 'i2'`);
check(comFoto.rows[0].note === 'freezer em 2 graus', 'mandar só a foto não apaga a nota do colega');
check(comFoto.rows[0].photo_path === 'rodada/t1/u1/i2.jpg', 'a foto entra na rodada');

const claimI2 = await db.query(`select * from public.claim_live_task(${chave('i2')},'bru','Bruno')`);
check(claimI2.rows[0].claimed === true, 'item com evidência ainda pode ser concluído');
check(claimI2.rows[0].note === 'freezer em 2 graus' && claimI2.rows[0].photo_path === 'rodada/t1/u1/i2.jpg',
  'concluir sem mandar evidência PRESERVA a que já estava lá');

// ── Release ──────────────────────────────────────────────────────────────────
const releaseErrado = await db.query(`select * from public.release_live_task(${chave('i1')},'bru')`);
check(releaseErrado.rows[0].released === false && releaseErrado.rows[0].done === true,
  'ninguém desmarca o trabalho do colega pelo release');

const releaseCerto = await db.query(`select * from public.release_live_task(${chave('i1')},'ana')`);
check(releaseCerto.rows[0].released === true && releaseCerto.rows[0].done === false,
  'o dono desmarca o que é dele');

// Desmarcada, a tarefa volta a ser reivindicável — por qualquer um.
const reclaim = await db.query(`select * from public.claim_live_task(${chave('i1')},'bru','Bruno')`);
check(reclaim.rows[0].claimed === true && reclaim.rows[0].operator_name === 'Bruno',
  'tarefa liberada volta para a rodada e o próximo leva');

// ── Reopen ───────────────────────────────────────────────────────────────────
const reopen = await db.query(
  `select * from public.reopen_live_task(${chave('i1')},'ana','Ana','ficou incompleto')`);
check(reopen.rows[0].reopened === true && reopen.rows[0].done === false, 'reabrir devolve a tarefa para pendente');
check(reopen.rows[0].reopened_count === 1, 'conta a reabertura no banco, não no cliente');

const auditoria = await db.query(
  `select operator_name, reopened_by_name, reopen_reason from public.live_tasks where item_id = 'i1'`);
check(auditoria.rows[0].reopened_by_name === 'Ana' && auditoria.rows[0].reopen_reason === 'ficou incompleto',
  'quem reabriu e por quê ficam na própria rodada');
check(auditoria.rows[0].operator_name === 'Bruno',
  'quem reabre NÃO herda o crédito de quem tinha executado');

const reopenVazio = await db.query(`select * from public.reopen_live_task(${chave('i1')},'ana','Ana','x')`);
check(reopenVazio.rows[0].reopened === false && reopenVazio.rows[0].reopened_count === 1,
  'reabrir o que já está pendente não incrementa o contador');

// Duas reaberturas seguidas contam duas — era o bug do ler-somar-gravar.
await db.query(`select * from public.claim_live_task(${chave('i1')},'bru','Bruno')`);
await db.query(`select * from public.reopen_live_task(${chave('i1')},'ana','Ana',null)`);
const contagem = await db.query(`select reopened_count, reopen_reason from public.live_tasks where item_id = 'i1'`);
check(contagem.rows[0].reopened_count === 2, 'reaberturas somam');
check(contagem.rows[0].reopen_reason === null, 'motivo em branco grava null, não string vazia');

// ── Purga ────────────────────────────────────────────────────────────────────
await db.exec(`
  insert into public.live_tasks (template_id, unit_id, date, item_id, done) values
    ('t1','u1', to_char(current_date - 120, 'YYYY-MM-DD'), 'velho', true),
    ('t1','u1', to_char(current_date -  91, 'YYYY-MM-DD'), 'limite', true),
    ('t1','u1', to_char(current_date -  89, 'YYYY-MM-DD'), 'recente', true);
`);
// O default é 90 — a mesma janela que o app lê em `fetchCompletions`.
const apagados = await db.query(`select public.purge_live_tasks() as n`);
check(apagados.rows[0].n === 2, 'a purga apaga só o que passou da retenção (2 linhas)');
const dentroDaJanela = await db.query(
  `select count(*)::int as n from public.live_tasks where item_id = 'recente'`);
check(dentroDaJanela.rows[0].n === 1, 'rodada dentro da janela de 90 dias NÃO é apagada');
const sobrou = await db.query(`select count(*)::int as n from public.live_tasks where date = '${HOJE}'`);
check(sobrou.rows[0].n === 2, 'a rodada de hoje fica intacta');

// ── Idempotência ─────────────────────────────────────────────────────────────
await db.exec(MIGRATION);
const depois = await db.query(`select reopened_count, note from public.live_tasks where item_id = 'i2'`);
check(depois.rows[0].note === 'freezer em 2 graus', 'idempotente — 2ª execução não mexe nos dados');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
