/**
 * Teste da migration 20260727_units_timezone.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260727_units_timezone.test.mjs
 *
 * Ver o cabeçalho de 20260726_data_local_brasilia.test.mjs para o porquê do
 * PGlite.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260727_units_timezone.sql', import.meta.url)),
  'utf8',
);

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

await db.exec(`
  create table public.units (
    id         text primary key,
    company_id text not null,
    name       text not null,
    color      text,
    active     boolean not null default true,
    sort_order int not null default 0
  );
  insert into public.units (id, company_id, name) values
    ('ibr1', 'ilhabelarepublic', 'IBR Centro'),
    ('ibr2', 'ilhabelarepublic', 'IBR Praia');
`);

console.log('═══ units.timezone ═══');

const saida = await db.exec(MIGRATION);
saida.at(-1).rows.forEach(r => console.log(`  ${r.fuso}: ${r.lojas} loja(s)`));

const { rows } = await db.query(`select id, timezone from public.units order by id`);
check(rows.every(r => r.timezone === 'America/Sao_Paulo'),
  'lojas existentes herdam Brasília — comportamento atual preservado');

// A coluna é NOT NULL: gravar nulo tem que falhar, não virar buraco silencioso.
let recusouNulo = false;
try { await db.query(`update public.units set timezone = null where id = 'ibr1'`); }
catch { recusouNulo = true; }
check(recusouNulo, 'timezone não aceita nulo');

// Sem CHECK: uma zona nova não exige migration.
await db.query(`update public.units set timezone = 'America/Manaus' where id = 'ibr2'`);
const manaus = await db.query(`select timezone from public.units where id = 'ibr2'`);
check(manaus.rows[0].timezone === 'America/Manaus', 'aceita zona nova sem migration');

// Idempotência: rodar de novo não pode reverter o que a loja configurou.
await db.exec(MIGRATION);
const depois = await db.query(`select id, timezone from public.units order by id`);
check(depois.rows.find(r => r.id === 'ibr2').timezone === 'America/Manaus',
  'idempotente — 2ª execução não sobrescreve o fuso configurado');
check(depois.rows.find(r => r.id === 'ibr1').timezone === 'America/Sao_Paulo',
  'idempotente — as demais seguem em Brasília');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
