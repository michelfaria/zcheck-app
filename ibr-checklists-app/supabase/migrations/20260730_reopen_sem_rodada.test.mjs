/**
 * Teste da migration 20260730_reopen_sem_rodada.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260730_reopen_sem_rodada.test.mjs
 *
 * O que está em jogo: a tarefa registrada em `completions` mas AUSENTE de
 * `live_tasks` aparece bloqueada no app (não se refaz o que já foi feito), e o
 * único jeito de refazer é reabrir. Se reabrir não criar a linha, ela fica
 * trancada para sempre — este teste é o que garante que não fica.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ler = (f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const BASE = ler('./20260729_live_tasks_colaborativo.sql');
const MIGRATION = ler('./20260730_reopen_sem_rodada.sql');

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

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

console.log('═══ reabrir sem rodada ═══');
await db.exec(BASE);
await db.exec(MIGRATION);

const HOJE = (await db.query(`select to_char(current_date, 'YYYY-MM-DD') as d`)).rows[0].d;
const chave = (item) => `'t1','u1','${HOJE}','${item}'`;

// ── O caso do impasse: tarefa sem NENHUMA linha na rodada ─────────────────────
const semRodada = await db.query(
  `select * from public.reopen_live_task(${chave('orfa')},'ana','Ana','precisa refazer')`);
check(semRodada.rows[0].reopened === true, 'tarefa ausente da rodada PODE ser reaberta');
check(semRodada.rows[0].done === false, 'e nasce pendente');
check(semRodada.rows[0].reopened_count === 1, 'com a reabertura contada');

const criada = await db.query(
  `select operator_user_id, reopened_by_name, reopen_reason from public.live_tasks where item_id = 'orfa'`);
check(criada.rows[0].reopened_by_name === 'Ana' && criada.rows[0].reopen_reason === 'precisa refazer',
  'quem reabriu e o motivo ficam gravados');
check(criada.rows[0].operator_user_id === null,
  'a linha criada não inventa executor — quem sabe disso é a conclusão gravada');

// Reaberta, a tarefa volta a ser reivindicável: é o ponto de reabrir.
const refeita = await db.query(`select * from public.claim_live_task(${chave('orfa')},'bru','Bruno')`);
check(refeita.rows[0].claimed === true && refeita.rows[0].operator_name === 'Bruno',
  'depois de reaberta, qualquer um pode executar');

// ── Sem regressão: o comportamento antigo continua ───────────────────────────
await db.query(`select * from public.claim_live_task(${chave('i1')},'ana','Ana')`);
const normal = await db.query(`select * from public.reopen_live_task(${chave('i1')},'bru','Bruno','x')`);
check(normal.rows[0].reopened === true && normal.rows[0].reopened_count === 1,
  'reabrir tarefa concluída na rodada segue funcionando');

const jaPendente = await db.query(`select * from public.reopen_live_task(${chave('i1')},'bru','Bruno','x')`);
check(jaPendente.rows[0].reopened === false && jaPendente.rows[0].reopened_count === 1,
  'reabrir o que já está pendente NÃO conta duas vezes');

const creditoIntacto = await db.query(`select operator_name from public.live_tasks where item_id = 'i1'`);
check(creditoIntacto.rows[0].operator_name === 'Ana',
  'quem reabre não herda o crédito de quem executou');

// ── Idempotência ─────────────────────────────────────────────────────────────
await db.exec(MIGRATION);
const depois = await db.query(`select reopened_count from public.live_tasks where item_id = 'i1'`);
check(depois.rows[0].reopened_count === 1, 'idempotente — 2ª execução não mexe nos dados');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
