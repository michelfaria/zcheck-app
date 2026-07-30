/**
 * Teste da migration 20260730_templates_desativar.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260730_templates_desativar.test.mjs
 *
 * O que está em jogo: a coerência entre `active` e `deactivated_at`. Se um
 * checklist ficar inativo SEM data, o app volta a não saber a partir de quando
 * ele deixou de ser previsto — e a aderência de dias já fechados muda sozinha.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260730_templates_desativar.sql', import.meta.url)),
  'utf8',
);

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

await db.exec(`
  create table public.templates (
    id         text primary key,
    company_id text,
    unit_id    text,
    sector     text,
    name       text,
    deadline   text,
    items      jsonb,
    updated_at timestamptz
  );
  insert into public.templates (id, unit_id, name) values
    ('t1','ibr1','Abertura — Salão'),
    ('t2','ibr1','Fechamento — Salão');
`);

console.log('═══ templates: desativar em vez de apagar ═══');
await db.exec(MIGRATION);

// ── Nada muda para quem já existia ───────────────────────────────────────────
const antes = await db.query(`select count(*)::int as n from public.templates where active`);
check(antes.rows[0].n === 2, 'checklists existentes continuam ativos');
const semData = await db.query(`select count(*)::int as n from public.templates where deactivated_at is not null`);
check(semData.rows[0].n === 0, 'e sem data de desativação');

// ── Desativar preenche a data sozinho ────────────────────────────────────────
await db.query(`update public.templates set active = false where id = 't1'`);
const off = await db.query(`select active, deactivated_at from public.templates where id = 't1'`);
check(off.rows[0].active === false && off.rows[0].deactivated_at !== null,
  'desativar preenche deactivated_at sem o cliente precisar mandar');

// O buraco que o trigger fecha: inativo SEM data.
await db.query(`update public.templates set active = false, deactivated_at = null where id = 't2'`);
const forcado = await db.query(`select deactivated_at from public.templates where id = 't2'`);
check(forcado.rows[0].deactivated_at !== null,
  'não dá para ficar inativo sem data, nem mandando null de propósito');

// ── Reativar limpa a data ────────────────────────────────────────────────────
await db.query(`update public.templates set active = true where id = 't1'`);
const on = await db.query(`select active, deactivated_at from public.templates where id = 't1'`);
check(on.rows[0].active === true && on.rows[0].deactivated_at === null,
  'reativar limpa a data — o checklist volta a ser previsto');

// ── A linha SOBREVIVE, que é o ponto ─────────────────────────────────────────
const total = await db.query(`select count(*)::int as n from public.templates`);
check(total.rows[0].n === 2, 'desativar não perde a linha: o histórico continua reconstruível');

// ── Checklist novo nasce ativo e COM data de criação ─────────────────────────
await db.query(`insert into public.templates (id, unit_id, name) values ('t3','ibr2','Rotina — Caixa')`);
const novo = await db.query(`select active, deactivated_at, created_at from public.templates where id = 't3'`);
check(novo.rows[0].active === true && novo.rows[0].deactivated_at === null, 'checklist novo nasce ativo');
check(novo.rows[0].created_at !== null,
  'checklist novo registra created_at — sem isso ele seria cobrado da semana passada');

// O outro lado, que é o mais delicado: as linhas ANTIGAS têm que ficar em NULL.
// `add column ... default now()` num só passo preencheria todas com "agora" e
// todo checklist do parque deixaria de ser previsto em datas anteriores.
const antigas = await db.query(`select count(*)::int as n from public.templates where id in ('t1','t2') and created_at is null`);
check(antigas.rows[0].n === 2,
  'checklists que já existiam ficam SEM created_at (= sempre existiram): nenhum número histórico se move');

// ── Idempotência ─────────────────────────────────────────────────────────────
await db.exec(MIGRATION);
const depois = await db.query(`select count(*)::int as n from public.templates where active`);
check(depois.rows[0].n === 2, 'idempotente — 2ª execução não reativa nem apaga nada');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
