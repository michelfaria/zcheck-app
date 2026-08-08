/**
 * Teste da migration 20260808_conferencia_endereco_historico.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260808_conferencia_endereco_historico.test.mjs
 *
 * Duas coisas estão em jogo, e as duas são difíceis de ver em produção:
 *
 * 1. RECONFERIR NÃO PODE APAGAR. A versão de 26/07 fazia `delete from
 *    task_reviews where completion_id` a cada chamada. Uma reprovação retirada
 *    sumia sem deixar rastro — e "preservar histórico" é justamente o que a
 *    pontuação da liderança vai passar a depender.
 *
 * 2. O FEEDBACK PRECISA CHEGAR EM QUEM EXECUTOU. Numa rodada dividida entre
 *    três pessoas, `operator_user_id` (o submissor) leva tudo. O destinatário
 *    tem que sair do `doneBy` do item, resolvido NO SERVIDOR — se o cliente
 *    puder escolher, dá para endereçar uma reprovação para a conta errada.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260808_conferencia_endereco_historico.sql', import.meta.url)),
  'utf8',
);

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const erroDe = async sql => { try { await db.exec(sql); return null; } catch (e) { return e.message; } };

// ── O banco como ele está HOJE em produção, antes desta migration ────────────
// `completions` não tem DDL nas migrations (nasceu antes do versionamento), então
// é reconstruída aqui a partir das colunas que o app lê e escreve.
await db.exec(`
  create role anon;
  create role authenticated;

  -- Os três helpers de sessão, iguais aos de 20260709_tenant_*: leem o claim.
  create or replace function public.jwt_user_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_id', '') $$;
  create or replace function public.jwt_user_role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_role', '') $$;
  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'company_id', '') $$;

  create table public.users (
    id text primary key, company_id text, name text, role text, unit_id text
  );
  create table public.completions (
    id text primary key, company_id text, unit_id text, template_id text,
    template_name text, sector text, date date, completed_at timestamptz,
    operator_user_id text, operator_name text, items jsonb,
    reviewed_by text, reviewed_by_name text, reviewed_at timestamptz, review_note text
  );
  -- Exatamente como 20260726_avaliacao_por_tarefa.sql a criou.
  create table public.task_reviews (
    id uuid primary key default gen_random_uuid(),
    company_id text not null, completion_id text not null, item_id text not null,
    verdict text not null check (verdict in ('aprovado','ressalva','reprovado')),
    note text, reviewed_by text not null, reviewed_by_name text,
    reviewed_at timestamptz not null default now(),
    operator_user_id text, date date,
    unique (completion_id, item_id)
  );

  insert into public.users (id, company_id, name, role) values
    ('lider',  'empresa-a', 'Ana Líder',   'lideranca'),
    ('joao',   'empresa-a', 'João',        'colaborador'),
    ('maria',  'empresa-a', 'Maria',       'colaborador'),
    ('outro',  'empresa-b', 'Chefe da B',  'lideranca');

  -- Rodada COLABORATIVA: João submeteu, mas i2 quem fez foi a Maria.
  insert into public.completions
    (id, company_id, unit_id, template_id, date, completed_at, operator_user_id, operator_name, items) values
    ('c1', 'empresa-a', 'u1', 't1', date '2026-08-07', now(), 'joao', 'João',
     '[{"id":"i1","done":true,"doneBy":"joao","doneByName":"João"},
       {"id":"i2","done":true,"doneBy":"maria","doneByName":"Maria"},
       {"id":"i3","done":false}]'::jsonb),
    ('c2', 'empresa-b', 'u9', 't9', date '2026-08-07', now(), 'alguem', 'Alguém', '[]'::jsonb);

  -- Conferência ANTIGA, gravada pela RPC de 26/07 (sem executed_by, sem ledger).
  insert into public.task_reviews
    (company_id, completion_id, item_id, verdict, note, reviewed_by, reviewed_by_name, operator_user_id, date)
  values ('empresa-a', 'c1', 'i1', 'ressalva', 'faltou capricho', 'lider', 'Ana Líder', 'joao', date '2026-08-07');
`);

const comoLider = `select set_config('request.jwt.claims', '{"user_id":"lider","user_role":"lideranca","company_id":"empresa-a"}', false);`;
const comoJoao  = `select set_config('request.jwt.claims', '{"user_id":"joao","user_role":"colaborador","company_id":"empresa-a"}', false);`;
const comoOutra = `select set_config('request.jwt.claims', '{"user_id":"outro","user_role":"lideranca","company_id":"empresa-b"}', false);`;

console.log('═══ conferência: endereçamento por executor + histórico ═══');
await db.exec(MIGRATION);

// ── Backfill ─────────────────────────────────────────────────────────────────
const bf = await db.query(`select executed_by_user_id, executed_by_name from public.task_reviews where item_id = 'i1'`);
check(bf.rows[0].executed_by_user_id === 'joao' && bf.rows[0].executed_by_name === 'João',
  'backfill preenche quem executou lendo o doneBy do items');

const orfas = await db.query(`select count(*)::int as n from public.task_reviews where executed_by_user_id is null`);
check(orfas.rows[0].n === 0, 'nenhum veredito antigo fica sem destinatário');

const semeado = await db.query(`select kind, verdict, batch_id::text as b from public.task_review_events`);
check(semeado.rows.length === 1 && semeado.rows[0].kind === 'veredito' && semeado.rows[0].verdict === 'ressalva',
  'o que já existia entra na ledger como primeiro evento');
check(semeado.rows[0].b === '00000000-0000-0000-0000-000000000001',
  'com o batch sintético de "antes da ledger" — a história não começa no meio');

// ── Portão de papel ──────────────────────────────────────────────────────────
await db.exec(comoJoao);
const recusa = await erroDe(`select public.review_tasks('c1', '[{"item_id":"i1","verdict":"aprovado"}]'::jsonb)`);
check(/apenas liderança/.test(recusa || ''), 'colaborador não confere — nem a própria execução');

// ── Isolamento entre empresas ────────────────────────────────────────────────
await db.exec(comoOutra);
const outroTenant = await erroDe(`select public.review_tasks('c1', '[{"item_id":"i1","verdict":"aprovado"}]'::jsonb)`);
check(/não encontrada/.test(outroTenant || ''), 'liderança de outra empresa não alcança a execução');

// ── Endereçamento por doneBy ─────────────────────────────────────────────────
await db.exec(comoLider);
await db.query(`select public.review_tasks('c1',
  '[{"item_id":"i1","verdict":"aprovado"},
    {"item_id":"i2","verdict":"reprovado","note":"refazer"},
    {"item_id":"i3","verdict":"reprovado"}]'::jsonb, 'no geral, ok')`);

const dest = await db.query(`select item_id, executed_by_user_id from public.task_reviews where completion_id='c1' order by item_id`);
check(dest.rows.length === 3, 'os três vereditos ficam no estado atual');
check(dest.rows[0].executed_by_user_id === 'joao' && dest.rows[1].executed_by_user_id === 'maria',
  'i1 vai para o João e i2 para a MARIA — quem executou, não quem submeteu');
check(dest.rows[2].executed_by_user_id === 'joao',
  'tarefa sem doneBy (não executada) cai no submissor, que é a régua antiga');

const snap = await db.query(`select item_id, done_snapshot from public.task_review_events where kind='veredito' and item_id in ('i2','i3') order by item_id`);
check(snap.rows[0].done_snapshot === true && snap.rows[1].done_snapshot === false,
  'done_snapshot registra o estado do item no momento da conferência');

const geral = await db.query(`select count(*)::int as n from public.task_review_events where kind='nota_geral'`);
check(geral.rows[0].n === 1, 'a nota do checklist inteiro também vira evento');

// ── O ponto da migration: reconferir PRESERVA ────────────────────────────────
await db.query(`select public.review_tasks('c1',
  '[{"item_id":"i1","verdict":"aprovado"},
    {"item_id":"i2","verdict":"aprovado"}]'::jsonb)`);

const trilha = await db.query(`
  select kind, verdict from public.task_review_events
   where item_id = 'i2' order by seq`);
check(trilha.rows.length === 2
  && trilha.rows[0].verdict === 'reprovado' && trilha.rows[1].verdict === 'aprovado',
  'a reprovação retirada continua na ledger, na ordem em que aconteceu');

const removida = await db.query(`select kind, verdict from public.task_review_events where item_id='i3' order by seq`);
check(removida.rows.some(r => r.kind === 'remocao' && r.verdict === 'reprovado'),
  'veredito que a liderança deixou de repetir vira "remocao" com o valor que tinha');

const atual = await db.query(`select item_id from public.task_reviews where completion_id='c1' order by item_id`);
check(atual.rows.length === 2 && !atual.rows.some(r => r.item_id === 'i3'),
  'e some do ESTADO ATUAL — retirar um veredito continua sendo possível');

// Reconferir sem mudar nada não pode poluir a ledger.
const antesRuido = (await db.query(`select count(*)::int as n from public.task_review_events`)).rows[0].n;
await db.query(`select public.review_tasks('c1',
  '[{"item_id":"i1","verdict":"aprovado"},{"item_id":"i2","verdict":"aprovado"}]'::jsonb)`);
const depoisRuido = (await db.query(`select count(*)::int as n from public.task_review_events`)).rows[0].n;
check(antesRuido === depoisRuido,
  'reconferir sem alterar nada não grava evento — a ledger continua legível');

// ── Desfazer ─────────────────────────────────────────────────────────────────
await db.query(`select public.review_tasks('c1', '[]'::jsonb, null, false)`);
const zerado = await db.query(`select count(*)::int as n from public.task_reviews where completion_id='c1'`);
check(zerado.rows[0].n === 0, 'desfazer limpa o estado atual');
const desfeito = await db.query(`select count(*)::int as n from public.task_review_events where kind='desfeito'`);
check(desfeito.rows[0].n === 2, 'e registra na ledger o que existia no momento de desfazer');
const marca = await db.query(`select reviewed_at, reviewed_by from public.completions where id='c1'`);
check(marca.rows[0].reviewed_at === null && marca.rows[0].reviewed_by === null,
  'a marca no checklist inteiro também sai — o índice da liderança acompanha');

// ── A ledger não é do cliente ────────────────────────────────────────────────
const grants = await db.query(`
  select count(*)::int as n from information_schema.table_privileges
   where table_name = 'task_review_events' and grantee in ('anon','authenticated')`);
check(grants.rows[0].n === 0, 'anon e authenticated não alcançam a ledger');
const policies = await db.query(`select count(*)::int as n from pg_policies where tablename = 'task_review_events'`);
check(policies.rows[0].n === 0, 'RLS ligada e sem policy: nega tudo, que é o default desejado');

// ── Idempotência ─────────────────────────────────────────────────────────────
const antes2 = (await db.query(`select count(*)::int as n from public.task_review_events`)).rows[0].n;
await db.exec(MIGRATION);
const depois2 = (await db.query(`select count(*)::int as n from public.task_review_events`)).rows[0].n;
check(antes2 === depois2, 'idempotente — 2ª execução não duplica a ledger nem refaz o backfill');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
