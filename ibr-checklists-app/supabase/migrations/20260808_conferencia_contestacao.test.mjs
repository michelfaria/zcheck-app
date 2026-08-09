/**
 * Teste da migration 20260808_conferencia_contestacao.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260808_conferencia_contestacao.test.mjs
 *
 * O que está em jogo: quem pode falar, sobre o quê, e se a conversa sobrevive.
 *
 * As três regras que este arquivo existe para provar:
 *   1. Só quem EXECUTOU a tarefa contesta — não o submissor, não o colega.
 *   2. Só apontamento se contesta — aprovação, não.
 *   3. Dar razão corrige o veredito NA MESMA TRANSAÇÃO. "Revista, mas continua
 *      reprovado" é um estado indefensável para quem contestou.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ler = f => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const HISTORICO = ler('./20260808_conferencia_endereco_historico.sql');
const MIGRATION = ler('./20260808_conferencia_contestacao.sql');

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

  create table public.users (id text primary key, company_id text, name text, role text, unit_id text);
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

  insert into public.users (id, company_id, name, role) values
    ('lider', 'empresa-a', 'Ana Líder', 'lideranca'),
    ('joao',  'empresa-a', 'João',      'colaborador'),
    ('maria', 'empresa-a', 'Maria',     'colaborador'),
    ('outro', 'empresa-b', 'Chefe da B','lideranca');

  -- João submeteu; i2 quem executou foi a Maria.
  insert into public.completions
    (id, company_id, date, operator_user_id, operator_name, items) values
    ('c1', 'empresa-a', date '2026-08-07', 'joao', 'João',
     '[{"id":"i1","done":true,"doneBy":"joao","doneByName":"João"},
       {"id":"i2","done":true,"doneBy":"maria","doneByName":"Maria"},
       {"id":"i3","done":true,"doneBy":"maria","doneByName":"Maria"}]'::jsonb);
`);

const comoLider = `select set_config('request.jwt.claims', '{"user_id":"lider","user_role":"lideranca","company_id":"empresa-a"}', false);`;
const comoJoao  = `select set_config('request.jwt.claims', '{"user_id":"joao","user_role":"colaborador","company_id":"empresa-a"}', false);`;
const comoMaria = `select set_config('request.jwt.claims', '{"user_id":"maria","user_role":"colaborador","company_id":"empresa-a"}', false);`;
const comoOutra = `select set_config('request.jwt.claims', '{"user_id":"outro","user_role":"lideranca","company_id":"empresa-b"}', false);`;

console.log('═══ conferência: o direito de discordar ═══');
await db.exec(HISTORICO);
await db.exec(MIGRATION);

// A liderança confere: i1 aprovada (João), i2 reprovada e i3 com ressalva (Maria).
await db.exec(comoLider);
await db.query(`select public.review_tasks('c1',
  '[{"item_id":"i1","verdict":"aprovado"},
    {"item_id":"i2","verdict":"reprovado","note":"praça suja"},
    {"item_id":"i3","verdict":"ressalva"}]'::jsonb)`);

// ── Regra 1: quem leva a nota é quem responde ────────────────────────────────
await db.exec(comoJoao);
const alheia = await erroDe(`select public.raise_dispute('c1','i2','discordo')`);
check(/só quem executou/.test(alheia || ''),
  'João não contesta a nota da Maria, mesmo tendo submetido o checklist');

await db.exec(comoLider);
const daLideranca = await erroDe(`select public.raise_dispute('c1','i2','em nome dela')`);
check(/só quem executou/.test(daLideranca || ''),
  'nem a liderança contesta "em nome de" — a voz é de quem recebeu');

// ── Regra 2: contesta-se apontamento, não elogio ─────────────────────────────
await db.exec(comoJoao);
const elogio = await erroDe(`select public.raise_dispute('c1','i1','quero discutir')`);
check(/ressalva e reprovação/.test(elogio || ''), 'aprovação não é contestável');

// ── Motivo é obrigatório ─────────────────────────────────────────────────────
await db.exec(comoMaria);
const mudo = await erroDe(`select public.raise_dispute('c1','i2','   ')`);
check(/precisa de um texto/.test(mudo || ''),
  'justificativa sem texto é recusada — o mesmo padrão que se cobra da liderança');

// ── Isolamento entre empresas ────────────────────────────────────────────────
await db.exec(comoOutra);
const outroTenant = await erroDe(`select public.raise_dispute('c1','i2','nada a ver')`);
check(/não existe avaliação|só quem executou/.test(outroTenant || ''),
  'outra empresa não alcança a avaliação');

// ── O caminho feliz ──────────────────────────────────────────────────────────
await db.exec(comoMaria);
await db.query(`select public.raise_dispute('c1','i2','a praça estava limpa; a foto é de antes do turno')`);
const aberta = await db.query(`select status, disputed_verdict, raised_by_name from public.review_disputes where item_id='i2'`);
check(aberta.rows[0].status === 'aberta' && aberta.rows[0].raised_by_name === 'Maria',
  'a contestação nasce aberta, no nome de quem executou');
check(aberta.rows[0].disputed_verdict === 'reprovado',
  'e guarda o veredito contestado — sem isso o caso fica ininteligível depois da correção');

// ── Quem lê o quê ────────────────────────────────────────────────────────────
await db.exec(comoMaria);
await db.query(`select public.raise_dispute('c1','i3','idem')`);
const daMaria = await db.query(`select count(*)::int as n from public.list_disputes()`);
check(daMaria.rows[0].n === 2, 'Maria vê as duas contestações dela');

await db.exec(comoJoao);
const doJoao = await db.query(`select count(*)::int as n from public.list_disputes()`);
check(doJoao.rows[0].n === 0, 'João não vê contestação de colega');

await db.exec(comoLider);
const daFila = await db.query(`select count(*)::int as n from public.list_disputes() where status='aberta'`);
check(daFila.rows[0].n === 2, 'a liderança vê a fila da empresa inteira');

// ── Responder mantendo ───────────────────────────────────────────────────────
await db.query(`select public.resolve_dispute('c1','i3','mantida','o padrão é o da foto de referência')`);
const mantida = await db.query(`select status, resolved_by_name, verdict from public.review_disputes d join public.task_reviews t using (completion_id, item_id) where d.item_id='i3'`);
check(mantida.rows[0].status === 'mantida' && mantida.rows[0].verdict === 'ressalva',
  'manter a decisão não mexe no veredito');

// ── Responder dando razão ────────────────────────────────────────────────────
await db.query(`select public.resolve_dispute('c1','i2','revista','você tem razão, era foto antiga','aprovado')`);
const revista = await db.query(`select d.status, t.verdict from public.review_disputes d join public.task_reviews t using (completion_id, item_id) where d.item_id='i2'`);
check(revista.rows[0].status === 'revista' && revista.rows[0].verdict === 'aprovado',
  'dar razão corrige o veredito na MESMA transação — não existe "revista mas continua reprovado"');

// ── A linha do tempo, numa consulta só ───────────────────────────────────────
const linha = await db.query(`select kind, verdict from public.task_review_events where item_id='i2' order by seq`);
check(linha.rows.map(r => r.kind).join(' → ') === 'veredito → contestacao → veredito → contestacao_resolvida',
  'o caso inteiro fica na MESMA ledger do veredito, na ordem: ' + linha.rows.map(r => r.kind).join(' → '));
check(linha.rows[1].verdict === 'reprovado' && linha.rows[2].verdict === 'aprovado',
  'e a ledger mostra o que era e o que virou');

// ── Reabrir ──────────────────────────────────────────────────────────────────
await db.exec(comoLider);
await db.query(`select public.review_tasks('c1',
  '[{"item_id":"i1","verdict":"aprovado"},
    {"item_id":"i2","verdict":"aprovado"},
    {"item_id":"i3","verdict":"reprovado","note":"revisto para pior"}]'::jsonb)`);
await db.exec(comoMaria);
await db.query(`select public.raise_dispute('c1','i3','de novo não')`);
const reaberta = await db.query(`select status, resolved_at, resolution_note from public.review_disputes where item_id='i3'`);
check(reaberta.rows[0].status === 'aberta' && reaberta.rows[0].resolved_at === null && reaberta.rows[0].resolution_note === null,
  'contestar de novo reabre limpo — a resposta da rodada anterior não fica pendurada');
const rodadas = await db.query(`select count(*)::int as n from public.task_review_events where item_id='i3' and kind='contestacao'`);
check(rodadas.rows[0].n === 2, 'e as duas rodadas da conversa continuam na ledger');

// ── Nada disso é leitura de cliente ──────────────────────────────────────────
const grants = await db.query(`
  select count(*)::int as n from information_schema.table_privileges
   where table_name = 'review_disputes' and grantee in ('anon','authenticated')`);
check(grants.rows[0].n === 0, 'anon e authenticated não alcançam a tabela direto');

// ── Idempotência ─────────────────────────────────────────────────────────────
const antes = (await db.query(`select count(*)::int as n from public.review_disputes`)).rows[0].n;
await db.exec(MIGRATION);
const depois = (await db.query(`select count(*)::int as n from public.review_disputes`)).rows[0].n;
check(antes === depois, 'idempotente — 2ª execução não perde contestação');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
