/**
 * Teste da migration 20260729_notification_log.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260729_notification_log.test.mjs
 *
 * Ver o cabeçalho de 20260726_data_local_brasilia.test.mjs para o porquê do
 * PGlite. Aqui o que precisa de teste é o ISOLAMENTO: a tabela nasce para
 * consertar um painel que mostrava linha de outra empresa, e "escapou do RLS"
 * não é coisa que se confira lendo o SQL. O teste roda de fato como
 * `authenticated`, com claim de empresa, e tenta atravessar a fronteira.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260729_notification_log.sql', import.meta.url)),
  'utf8',
);

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const falha = async (sql) => {
  try { await db.exec(sql); return null; } catch (e) { return e.message; }
};

// Papéis e função de tenant como existem no Supabase (tenant_01).
await db.exec(`
  create role anon;
  create role authenticated;
  create or replace function public.jwt_company_id()
  returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'company_id', '')
  $$;
`);

console.log('═══ notification_log ═══');
await db.exec(MIGRATION);

const comoEmpresa = (id) => `
  set role authenticated;
  select set_config('request.jwt.claims', '{"company_id":"${id}"}', false);
`;
// '{}' e não '': o PostgREST sempre publica um objeto JSON aqui (para o anon,
// `{"role":"anon"}`). String vazia quebraria no cast antes do `nullif`.
const comoDono = `reset role; select set_config('request.jwt.claims', '{}', false);`;

// ── Escrita do app (aprovação de cadastro) ───────────────────────────────────
await db.exec(comoEmpresa('empresa-a'));
await db.exec(`
  insert into public.notification_log (unit_id, kind, title, body, targets, delivered)
  values ('u1', 'cadastro', 'ZCheck', 'Seu cadastro foi aprovado!', 1, 1);
`);
const daA = await db.query(`select company_id, delivered from public.notification_log`);
check(daA.rows.length === 1, 'o app grava sem informar a empresa');
check(daA.rows[0].company_id === 'empresa-a', 'o DEFAULT carimba a empresa do token');

// ── Escrita da edge function (service_role não passa por RLS) ────────────────
await db.exec(comoDono);
await db.exec(`
  insert into public.notification_log (company_id, unit_id, kind, title, template_id, targets, delivered)
  values ('empresa-b', 'u9', 'atraso', '⚠ Checklist atrasado — U9', 't-b', 3, 2);
`);

// ── Fronteira ────────────────────────────────────────────────────────────────
await db.exec(comoEmpresa('empresa-a'));
const visivel = await db.query(`select company_id from public.notification_log`);
check(visivel.rows.length === 1 && visivel.rows[0].company_id === 'empresa-a',
  'a empresa A não enxerga a linha da B (era exatamente o furo de `config`)');

const forjada = await falha(`
  insert into public.notification_log (company_id, kind, title)
  values ('empresa-b', 'atraso', 'forjada');
`);
check(/row-level security/i.test(forjada || ''),
  'com company_id de outra empresa, o INSERT é recusado');

await db.exec(comoEmpresa('empresa-b'));
const daB = await db.query(`select template_id, targets, delivered from public.notification_log`);
check(daB.rows.length === 1 && daB.rows[0].template_id === 't-b',
  'a empresa B enxerga a sua, e só a sua');
check(daB.rows[0].targets === 3 && daB.rows[0].delivered === 2,
  'alvos e entregues chegam separados — é assim que se vê inscrição expirada');

// Sem token não há empresa: `using` compara com NULL e nada aparece.
await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{}', false);`);
const semToken = await db.query(`select 1 from public.notification_log`);
check(semToken.rows.length === 0, 'sem claim de empresa, zero linha — falha fechada');

// ── O anon (a chave que vai no bundle) ───────────────────────────────────────
await db.exec(`reset role; set role anon;`);
const anon = await falha(`select 1 from public.notification_log`);
check(/permission denied/i.test(anon || ''), 'o anon não tem grant — nem leitura');

// ── Idempotência ─────────────────────────────────────────────────────────────
await db.exec(comoDono);
await db.exec(MIGRATION);
const sobreviveu = await db.query(`select count(*)::int as n from public.notification_log`);
check(sobreviveu.rows[0].n === 2, 'idempotente — 2ª execução não apaga o que já estava lá');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
