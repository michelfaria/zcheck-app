/**
 * Teste da migration 20260808_conferencia_privacidade.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260808_conferencia_privacidade.test.mjs
 *
 * O que está em jogo, em ordem de gravidade:
 *
 * 1. VAZAMENTO ENTRE EMPRESAS. `task_verdicts` é uma view: ela roda com o
 *    privilégio do dono e NÃO aplica o RLS da tabela base. Se o filtro de
 *    tenant sair de dentro dela num refactor, a empresa A passa a ler a B —
 *    silenciosamente, sem erro nenhum. É o teste mais importante do arquivo.
 *
 * 2. A NOTA É DE QUEM RECEBEU. Hoje qualquer colaborador logado lê, pelo
 *    PostgREST, tudo que a liderança já escreveu sobre qualquer colega.
 *
 * 3. O VEREDITO CONTINUA PÚBLICO. Não é descuido: `computeOperationalProfile`
 *    calcula o índice de TERCEIROS no ranking da Equipe, no cliente. Esconder
 *    o veredito e exibir o ranking derivado dele seria privacidade de fachada.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('./20260808_conferencia_endereco_historico.sql', import.meta.url));
const alvo = fileURLToPath(new URL('./20260808_conferencia_privacidade.sql', import.meta.url));
const MIGRATION_A = readFileSync(base, 'utf8');
const MIGRATION_B = readFileSync(alvo, 'utf8');

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const erroDe = async sql => { try { await db.exec(sql); return null; } catch (e) { return e.message; } };

await db.exec(`
  create role anon;
  create role authenticated;

  create or replace function public.jwt_user_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_id', '') $$;
  create or replace function public.jwt_user_role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_role', '') $$;
  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'company_id', '') $$;

  -- Stub de review_completion: existe em produção desde 26/07 e a migration B
  -- revoga o execute dela. Sem o stub, o revoke falha.
  create or replace function public.review_completion(text, text default null, boolean default true)
    returns void language sql as $$ select null::void $$;

  create table public.users (
    id text primary key, company_id text, name text, role text, unit_id text
  );
  create table public.completions (
    id text primary key, company_id text, unit_id text, template_id text,
    template_name text, sector text, date date, completed_at timestamptz,
    operator_user_id text, operator_name text, items jsonb,
    reviewed_by text, reviewed_by_name text, reviewed_at timestamptz, review_note text
  );
  create table public.task_reviews (
    id uuid primary key default gen_random_uuid(),
    company_id text not null, completion_id text not null, item_id text not null,
    verdict text not null check (verdict in ('aprovado','ressalva','reprovado')),
    note text, reviewed_by text not null, reviewed_by_name text,
    reviewed_at timestamptz not null default now(),
    operator_user_id text, date date,
    unique (completion_id, item_id)
  );
  -- O grant que 20260726_avaliacao_por_tarefa.sql deu e que esta migration NÃO
  -- revoga (o revoke é o passo 3, depois do deploy). Sem reproduzi-lo aqui, o
  -- teste do passo 3 mediria a ausência de algo que nunca existiu.
  grant select on public.task_reviews to authenticated;

  insert into public.users (id, company_id, name, role) values
    ('lider', 'empresa-a', 'Ana Líder',  'lideranca'),
    ('joao',  'empresa-a', 'João',       'colaborador'),
    ('maria', 'empresa-a', 'Maria',      'colaborador'),
    ('bea',   'empresa-b', 'Bea da B',   'lideranca');

  insert into public.completions
    (id, company_id, unit_id, template_id, date, completed_at, operator_user_id, operator_name, items, review_note) values
    ('c1', 'empresa-a', 'u1', 't1', date '2026-08-07', now(), 'joao', 'João',
     '[{"id":"i1","done":true,"doneBy":"joao","doneByName":"João"},
       {"id":"i2","done":true,"doneBy":"maria","doneByName":"Maria"}]'::jsonb,
     'no geral, ok'),
    ('cB', 'empresa-b', 'u9', 't9', date '2026-08-07', now(), 'zed', 'Zed', '[]'::jsonb, null);

  insert into public.task_reviews
    (company_id, completion_id, item_id, verdict, note, reviewed_by, reviewed_by_name, operator_user_id, date)
  values ('empresa-b', 'cB', 'x1', 'reprovado', 'segredo da empresa B', 'bea', 'Bea da B', 'zed', date '2026-08-07');
`);

const comoLider = `select set_config('request.jwt.claims', '{"user_id":"lider","user_role":"lideranca","company_id":"empresa-a"}', false);`;
const comoJoao  = `select set_config('request.jwt.claims', '{"user_id":"joao","user_role":"colaborador","company_id":"empresa-a"}', false);`;
const comoMaria = `select set_config('request.jwt.claims', '{"user_id":"maria","user_role":"colaborador","company_id":"empresa-a"}', false);`;

console.log('═══ conferência: nota privada, veredito público ═══');
await db.exec(MIGRATION_A);
await db.exec(MIGRATION_B);

// ── A nota do checklist saiu de completions ──────────────────────────────────
const col = await db.query(`select review_note from public.completions where id = 'c1'`);
check(col.rows[0].review_note === null,
  'completions.review_note zerado — a coluna não dá para fechar por grant, então some');
const movida = await db.query(`select note from public.completion_review_notes where completion_id = 'c1'`);
check(movida.rows[0]?.note === 'no geral, ok', 'e a nota foi preservada na tabela privada');

// ── A liderança confere; a nota nova não volta para completions ──────────────
await db.exec(comoLider);
await db.query(`select public.review_tasks('c1',
  '[{"item_id":"i1","verdict":"aprovado"},
    {"item_id":"i2","verdict":"reprovado","note":"refazer a câmara fria"}]'::jsonb,
  'time atento hoje')`);

const depois = await db.query(`select review_note from public.completions where id = 'c1'`);
check(depois.rows[0].review_note === null, 'a RPC nunca mais escreve em completions.review_note');
const nova = await db.query(`select note from public.completion_review_notes where completion_id='c1'`);
check(nova.rows[0].note === 'time atento hoje', 'a nota geral nova vai para a tabela privada');

// ── O VEREDITO continua público dentro da empresa ────────────────────────────
await db.exec(comoJoao);
const vistos = await db.query(`select item_id, verdict from public.task_verdicts order by item_id`);
check(vistos.rows.length === 2, 'colaborador enxerga os vereditos da empresa — o ranking depende disso');
const colunas = await db.query(`
  select count(*)::int as n from information_schema.columns
   where table_name = 'task_verdicts' and column_name = 'note'`);
check(colunas.rows[0].n === 0, 'e a view NÃO expõe a coluna note');

// ── A NOTA é de quem recebeu ─────────────────────────────────────────────────
const doJoao = await db.query(`select item_id, note from public.my_task_notes()`);
check(doJoao.rows.length === 0,
  'João não lê a nota escrita sobre a tarefa da Maria, mesmo tendo submetido o checklist');

await db.exec(comoMaria);
const daMaria = await db.query(`select item_id, note from public.my_task_notes()`);
check(daMaria.rows.length === 1 && daMaria.rows[0].note === 'refazer a câmara fria',
  'Maria lê a dela, porque foi ELA quem executou a tarefa');

await db.exec(comoLider);
const daLider = await db.query(`select count(*)::int as n from public.my_task_notes()`);
check(daLider.rows[0].n === 1, 'a liderança lê todas — precisa reabrir a conferência e ver o que escreveu');

// ── Isolamento entre empresas: o teste que mais importa ──────────────────────
await db.exec(comoJoao);
const vazaVeredito = await db.query(`select count(*)::int as n from public.task_verdicts where company_id = 'empresa-b'`);
check(vazaVeredito.rows[0].n === 0, 'a view NÃO deixa a empresa A ver veredito da empresa B');
const vazaNota = await db.query(`select count(*)::int as n from public.my_task_notes() where note like '%segredo%'`);
check(vazaNota.rows[0].n === 0, 'nem a nota');

// A liderança da B também não alcança a A — o filtro vale nos dois sentidos.
await db.exec(`select set_config('request.jwt.claims', '{"user_id":"bea","user_role":"lideranca","company_id":"empresa-b"}', false);`);
const beaVe = await db.query(`select count(*)::int as n from public.task_verdicts where company_id = 'empresa-a'`);
check(beaVe.rows[0].n === 0, 'e a liderança da B não alcança a A, mesmo sendo liderança');

// ── Porta lateral fechada ────────────────────────────────────────────────────
const rc = await db.query(`
  select count(*)::int as n from information_schema.routine_privileges
   where routine_name = 'review_completion' and grantee in ('anon','authenticated')`);
check(rc.rows[0].n === 0, 'review_completion (código morto que escrevia review_note direto) não é mais executável');

const notasGrants = await db.query(`
  select count(*)::int as n from information_schema.table_privileges
   where table_name = 'completion_review_notes' and grantee in ('anon','authenticated')`);
check(notasGrants.rows[0].n === 0, 'a tabela de notas do checklist não é alcançável direto');

const anonView = await db.query(`
  select count(*)::int as n from information_schema.table_privileges
   where table_name = 'task_verdicts' and grantee = 'anon'`);
check(anonView.rows[0].n === 0, 'anon (a chave que vai no bundle) não alcança nem a view');

// ── O revoke final, que o arquivo deixa comentado de propósito ───────────────
const aindaLe = await db.query(`
  select count(*)::int as n from information_schema.table_privileges
   where table_name = 'task_reviews' and grantee = 'authenticated' and privilege_type = 'SELECT'`);
check(aindaLe.rows[0].n === 1,
  'task_reviews AINDA é legível: o revoke é o passo 3, depois do deploy — invertido, derruba o app');

// Simula o passo 3 e confirma que o corte funciona de verdade.
await db.exec(`reset role; revoke select on public.task_reviews from authenticated;`);
await db.exec(`set role authenticated;`);
await db.exec(comoJoao);
const bloqueado = await erroDe(`select * from public.task_reviews`);
check(/permission denied|permissão/i.test(bloqueado || ''), 'depois do passo 3, a tabela crua fica fora do alcance');
const aindaVeredito = await db.query(`select count(*)::int as n from public.task_verdicts`);
check(aindaVeredito.rows[0].n === 2, 'e o veredito continua chegando pela view — o ranking não quebra');
await db.exec(`reset role;`);

// ── Idempotência ─────────────────────────────────────────────────────────────
await db.exec(MIGRATION_B);
const idem = await db.query(`select count(*)::int as n from public.completion_review_notes`);
check(idem.rows[0].n === 1, 'idempotente — 2ª execução não duplica nem perde a nota');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
