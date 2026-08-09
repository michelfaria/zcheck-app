/**
 * Teste da migration 20260808_revoke_truncate_publico.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260808_revoke_truncate_publico.test.mjs
 *
 * O que está em jogo tem dois lados, e o segundo é o que costuma quebrar
 * produção quando alguém "endurece a segurança":
 *
 *   1. TRUNCATE tem que sumir de anon/authenticated em TODA tabela de public,
 *      inclusive nas que forem criadas depois. TRUNCATE ignora RLS, então é a
 *      única forma de apagar dado de outra empresa sem passar por policy.
 *
 *   2. E NADA MAIS pode sumir. O app apaga templates, users, closures, units,
 *      sectors e tipos de checklist como `authenticated`. Se este arquivo
 *      levar o DELETE junto, o produto quebra em silêncio — e só na hora em
 *      que alguém tentar apagar uma loja.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260808_revoke_truncate_publico.sql', import.meta.url)),
  'utf8',
);

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const conta = async sql => (await db.query(sql)).rows[0].n;

// O estado de produção: tabelas com o pacote completo que os default
// privileges do Supabase entregam.
await db.exec(`
  create role anon;
  create role authenticated;

  create table public.completions (id text primary key, company_id text);
  create table public.templates   (id text primary key, company_id text);
  create table public.users       (id text primary key, company_id text);
  create table public.waitlist    (id serial primary key, email text);
  create view  public.task_verdicts as select id, company_id from public.completions;

  grant all on public.completions, public.templates, public.users, public.waitlist
    to anon, authenticated;
  -- A view leva o pacote inteiro, como no Supabase: "alter default privileges
  -- ... on tables" cobre view e materialized view. Foi por não cobrir isso que
  -- a primeira versão da migration deixou 3 concessões para trás.
  grant all on public.task_verdicts to anon, authenticated;

  -- E o default que reproduz a origem do problema: tabela nova nasce aberta.
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);

console.log('═══ fechar o TRUNCATE de anon/authenticated ═══');

const antes = await conta(`select count(*)::int as n from information_schema.table_privileges
  where table_schema='public' and grantee in ('anon','authenticated') and privilege_type='TRUNCATE'`);
check(antes > 0, `antes da migration, ${antes} concessões de TRUNCATE (o estado de produção)`);

await db.exec(MIGRATION);

// ── (1) O buraco fechou ──────────────────────────────────────────────────────
const depois = await conta(`select count(*)::int as n from information_schema.table_privileges
  where table_schema='public' and grantee in ('anon','authenticated')
    and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')`);
check(depois === 0, 'nenhuma tabela entrega mais TRUNCATE, TRIGGER ou REFERENCES ao cliente');

// ── (2) E NADA MAIS fechou — o teste que protege o produto ───────────────────
for (const t of ['completions', 'templates', 'users', 'waitlist']) {
  const privs = (await db.query(`select privilege_type from information_schema.table_privileges
    where table_schema='public' and table_name='${t}' and grantee='authenticated'
    order by privilege_type`)).rows.map(r => r.privilege_type);
  const esperado = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
  check(esperado.every(p => privs.includes(p)),
    `${t}: SELECT/INSERT/UPDATE/DELETE intactos (${privs.join(', ') || 'nenhum'})`);
}

// O DELETE é o mais fácil de levar junto por engano, e o app depende dele em
// seis lugares (sync.js:123, 302, 841, 1441, 1446, 1451).
// Contado nas TABELAS que o app apaga, não em tudo: um `count` solto passaria a
// medir também as views do fixture e viraria número mágico a cada mudança.
const APAGA = `('completions','templates','users','waitlist')`;
const deletes = await conta(`select count(*)::int as n from information_schema.table_privileges
  where table_schema='public' and grantee='authenticated' and privilege_type='DELETE'
    and table_name in ${APAGA}`);
check(deletes === 4, 'o DELETE de que o app depende continua em todas as tabelas');

// ── (3) A próxima tabela não nasce aberta ────────────────────────────────────
await db.exec(`create table public.zz_nova (id int);`);
const nova = await conta(`select count(*)::int as n from information_schema.table_privileges
  where table_name='zz_nova' and grantee in ('anon','authenticated') and privilege_type='TRUNCATE'`);
check(nova === 0, 'tabela criada DEPOIS da migration não nasce com TRUNCATE');
const novaSelect = await conta(`select count(*)::int as n from information_schema.table_privileges
  where table_name='zz_nova' and grantee in ('anon','authenticated') and privilege_type='SELECT'`);
check(novaSelect === 2, 'e continua nascendo com SELECT — a migration mira o excesso, não o padrão');

// ── (4) Views também fecham, e continuam legíveis ────────────────────────────
// Em view o TRUNCATE é inofensivo, mas o TRIGGER permite INSTEAD OF — ou seja,
// interceptar o que se lê e escreve através dela. E `task_verdicts` é o caminho
// pelo qual todo colaborador lê veredito desde a migration de privacidade.
const viewSuja = await conta(`select count(*)::int as n from information_schema.table_privileges
  where table_name='task_verdicts' and grantee in ('anon','authenticated')
    and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')`);
check(viewSuja === 0, 'a view task_verdicts também perde TRIGGER — INSTEAD OF interceptaria a leitura');
const view = await conta(`select count(*)::int as n from information_schema.table_privileges
  where table_name='task_verdicts' and grantee in ('anon','authenticated') and privilege_type='SELECT'`);
check(view === 2, 'e continua legível — sem isso o ranking da equipe quebraria');

// ── (5) Idempotência ─────────────────────────────────────────────────────────
await db.exec(MIGRATION);
const final = await conta(`select count(*)::int as n from information_schema.table_privileges
  where table_schema='public' and grantee='authenticated' and privilege_type='DELETE'
    and table_name in ${APAGA}`);
check(final === deletes, 'idempotente — 2ª execução não come privilégio nenhum a mais');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
