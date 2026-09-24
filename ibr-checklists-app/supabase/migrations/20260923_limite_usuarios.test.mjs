/**
 * Teste da migration 20260923_limite_usuarios.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260923_limite_usuarios.test.mjs
 *
 * Ver o cabeçalho de 20260726_data_local_brasilia.test.mjs para o porquê do
 * PGlite (o preview branch do Supabase não serve: 11 tabelas sem `create table`).
 *
 * O que está em jogo são DOIS erros opostos, e os dois custam caro:
 *
 *   1. Deixar passar. A vaga é cobrada; se o banco aceitar o 11º usuário de
 *      uma loja sem vaga contratada, a regra vira sugestão — e o app escreve
 *      em `users` direto pela REST, sem passar por tela nenhuma.
 *   2. Barrar o que não pede vaga. O app manda `suspended` no SET de TODO
 *      update, e a aprovação de cadastro é um INSERT ... ON CONFLICT. Um
 *      trigger ingênuo impediria uma empresa acima da capacidade de corrigir
 *      o nome de alguém, e cobraria vaga para reaprovar quem já está lá.
 *
 * Os caminhos de escrita são os DE VERDADE: a aprovação roda a
 * `create_user_from_request` de 20260726_tenant_03e e o cadastro roda a
 * `provision_company` v3 de 20260720_cnpj_cadastro (com os gatilhos de CNPJ de
 * 20260820_grupo_cliente), lidas dos próprios arquivos.
 *
 * ATENÇÃO ao nome do arquivo: 20260720_cnpj_cadastro entrou no repositório em
 * 12/09/2026 (7455192), DEPOIS de 20260721_trial_14_dias (21/07) — a data do
 * nome engana, a v3 é a viva. Ela exige CNPJ por padrão (`require_cnpj`), por
 * isso o cadastro abaixo manda o payload do /comecar e o do Core "sem CNPJ".
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const ler = f => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const MIGRATION = ler('./20260923_limite_usuarios.sql');
const APROVACAO = ler('./20260726_tenant_03e_fecha_create_user_from_request.sql');
const PROVISION = ler('./20260720_cnpj_cadastro.sql');
const GRUPO     = ler('./20260820_grupo_cliente.sql');

// Qual provision_company está viva não se deduz pelo nome (ver acima). Estas
// são as migrations que a definem; se aparecer outra, a lista não bate e o
// teste falha — é a hora de conferir qual é a mais nova e passar a lê-la.
const DEFINEM_PROVISION = [
  '20260709_tenant_04_provision.sql', '20260715_signups.sql', '20260716_billing.sql',
  '20260717_onboarding.sql', '20260720_cnpj_cadastro.sql', '20260721_trial_14_dias.sql',
];
const definemProvisionHoje = readdirSync(DIR)
  .filter(f => f.endsWith('.sql'))
  .filter(f => /create\s+or\s+replace\s+function\s+public\.provision_company\s*\(/i.test(ler(`./${f}`)))
  .sort();

// A view de saúde como está em produção: o bloco de 20260719_admin_views, lido
// do arquivo — é a única migration que a define. Se alguém a redefinir em
// outra migration, este teste precisa passar a ler de lá.
const VIEW_ATUAL = ler('./20260719_admin_views.sql')
  .match(/create or replace view public\.admin_company_health as[\s\S]*?from public\.companies co;/)?.[0];
if (!VIEW_ATUAL) throw new Error('admin_company_health não encontrada em 20260719_admin_views.sql');

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const erroDe = async sql => { try { await db.exec(sql); return null; } catch (e) { return e; } };
const um = async sql => (await db.query(sql)).rows[0];
const detalhe = e => { try { return JSON.parse(e?.detail || ''); } catch { return null; } };
const provisiona = async p => {
  try { return { r: (await db.query(`select public.provision_company($1::jsonb) as r`, [JSON.stringify(p)])).rows[0].r }; }
  catch (e) { return { e }; }
};

// A trava do contrato (PLANO §3): pg_advisory_xact_lock(hashtext('zc_quota:' ||
// empresa)). O pg_locks parte a chave bigint em classid (32 bits altos) e objid
// (32 baixos), com objsubid = 1; aqui ela é remontada e comparada com a chave
// esperada — contar travas não basta: se o trigger e set_extra_seats usarem
// chaves diferentes, cada um trava sozinho e a corrida volta.
const travasDaCota = async company => (await um(`select count(*)::int as n from pg_locks
  where locktype = 'advisory' and objsubid = 1
    and ((classid::bigint << 32) | objid::bigint) = hashtext('zc_quota:' || '${company}')::bigint`)).n;

// Sessões. O PostgREST faz `set role` e publica o token em request.jwt.claims;
// o SQL Editor roda como postgres, sem claim nenhum.
const como = (company, userId, userRole) => `
  reset role;
  select set_config('request.jwt.claims',
    '{"role":"authenticated","company_id":"${company}","user_id":"${userId}","user_role":"${userRole}"}', false);
  set role authenticated;
`;
const comoServidor = `
  reset role;
  select set_config('request.jwt.claims', '{"role":"service_role"}', false);
  set role service_role;
`;
const comoDono = `reset role; select set_config('request.jwt.claims', '{}', false);`;

// ── Produção, em miniatura ───────────────────────────────────────────────────
await db.exec(`
  create role anon;
  create role authenticated;
  -- Como no Supabase: a service_role ignora RLS (é assim que as rotas do
  -- servidor leem billing_accounts, que tem RLS ligado e nenhuma policy).
  create role service_role bypassrls;

  -- Os default privileges do Supabase: tabela e função novas nascem abertas
  -- para anon/authenticated. É contra isso que a migration tem de se fechar.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'company_id', '') $$;
  create or replace function public.jwt_user_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_id', '') $$;
  create or replace function public.jwt_user_role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', '') $$;

  create table public.companies (
    id text primary key, name text, slug text unique, primary_color text, plan text,
    active boolean default true, created_at timestamptz default now(), onboarded_at timestamptz,
    trial_ends_at timestamptz, subscription_status text, plan_tier text, unit_limit integer,
    current_period_end timestamptz, mp_preapproval_id text,
    -- da Fase 2.2 do Core; 20260720_cnpj_cadastro conta com elas
    contact_email text, contact_whatsapp text
  );
  create table public.units (
    id text primary key, company_id text not null, name text not null, color text,
    active boolean not null default true, sort_order int not null default 0,
    timezone text not null default 'America/Sao_Paulo', active_from date
  );
  -- users não tem create table no repositório; colunas como o app as grava.
  create table public.users (
    id text primary key, company_id text default public.jwt_company_id(),
    name text not null, pin text not null, role text, unit_id text, sector_id text,
    suspended boolean default false, updated_at timestamptz default now(), avatar_url text
  );
  create table public.user_requests (
    id text primary key, company_id text, name text, pin text, status text default 'pendente'
  );
  create table public.sectors (id text primary key, company_id text, unit_id text, name text, sort_order int);
  create table public.checklist_types (id text primary key, company_id text, name text, sort_order int);
  create table public.events (id serial primary key, company_id text, occurred_at timestamptz);
  create table public.completions (id text primary key, company_id text, date text, completed_at text);

  -- A policy de 20260709_tenant_02: só empresa, sem papel. É por ela que
  -- qualquer token escreve em users pela REST.
  alter table public.users enable row level security;
  create policy users_tenant_rw on public.users for all to authenticated
    using (company_id = public.jwt_company_id())
    with check (company_id = public.jwt_company_id());
  revoke all on public.users from anon;

  ${VIEW_ATUAL}
  revoke all on public.admin_company_health from anon, authenticated;
`);
await db.exec(APROVACAO);
await db.exec(PROVISION);
await db.exec(GRUPO);

// Empresas:
//   ibr     — cortesia, 3 lojas, 30 ativos + 1 suspenso (isenta)
//   uma     — 1 loja ativa + 1 desativada, 10 ativos (gerente em 2 lojas) + 1 suspenso
//   duas    — 2 lojas, 15 ativos + 1 suspenso
//   estreia — lojas com active_from passado, futuro, desativada
//   leste/oeste/fuso-ruim — a MESMA data de estreia em fusos diferentes
//   ibr-li53392s — o id REAL do IBR em produção: plan_tier NULL, 'trialing'
//                  (SQL Editor, 24/09/2026) — isento pelo id, não pelo plan_tier
await db.exec(`
  insert into public.companies (id, name, slug, plan, subscription_status, plan_tier) values
    ('ibr',       'IBR',       'ibr',       'pro',   'active',   'cortesia'),
    ('uma',       'Uma',       'uma',       'trial', 'trialing', null),
    ('duas',      'Duas',      'duas',      'trial', 'trialing', null),
    ('estreia',   'Estreia',   'estreia',   'trial', 'trialing', null),
    ('leste',     'Leste',     'leste',     'trial', 'trialing', null),
    ('oeste',     'Oeste',     'oeste',     'trial', 'trialing', null),
    ('fuso-ruim', 'Fuso Ruim', 'fuso-ruim', 'trial', 'trialing', null),
    ('ibr-li53392s', 'Ilhabela Republic', 'ibr-prod', 'trial', 'trialing', null);

  insert into public.units (id, company_id, name, active, timezone, active_from) values
    ('ibr1', 'ibr', 'IBR 1', true, 'America/Sao_Paulo', null),
    ('ibr2', 'ibr', 'IBR 2', true, 'America/Sao_Paulo', null),
    ('ibr3', 'ibr', 'IBR 3', true, 'America/Sao_Paulo', null),
    ('uma-1',   'uma', 'Uma 1',   true,  'America/Sao_Paulo', null),
    ('uma-off', 'uma', 'Uma Off', false, 'America/Sao_Paulo', null),
    ('duas-1', 'duas', 'Duas 1', true, 'America/Sao_Paulo', null),
    ('duas-2', 'duas', 'Duas 2', true, 'America/Sao_Paulo', null),
    ('est-passada', 'estreia', 'Passada', true,  'America/Manaus',    current_date - 30),
    ('est-futura',  'estreia', 'Futura',  true,  'America/Sao_Paulo', current_date + 30),
    ('est-sempre',  'estreia', 'Sempre',  true,  'America/Sao_Paulo', null),
    ('est-inativa', 'estreia', 'Inativa', false, 'America/Sao_Paulo', current_date - 30),
    -- Kiritimati é UTC+14 e Pago Pago UTC−11: 25 h de diferença, então o
    -- "hoje" de Kiritimati é SEMPRE amanhã (ou depois) em Pago Pago.
    ('leste-1', 'leste', 'Leste', true, 'Pacific/Kiritimati', (now() at time zone 'Pacific/Kiritimati')::date),
    ('oeste-1', 'oeste', 'Oeste', true, 'Pacific/Pago_Pago',  (now() at time zone 'Pacific/Kiritimati')::date),
    ('ruim-1',  'fuso-ruim', 'Ruim', true, 'Marte/Olympus',   current_date - 30);

  insert into public.users (id, company_id, name, pin, role, unit_id, suspended)
  select 'ibr-u' || g, 'ibr', 'Pessoa ' || g, '1111', 'colaborador', 'ibr1', false
    from generate_series(1, 30) g;
  insert into public.users (id, company_id, name, pin, role, unit_id, suspended) values
    ('ibr-s1', 'ibr', 'Suspensa IBR', '1111', 'colaborador', 'ibr1', true);

  insert into public.users (id, company_id, name, pin, role, unit_id, suspended) values
    ('uma-adm', 'uma', 'Dona da Uma', '1111', 'gestao',   null,            false),
    ('uma-ger', 'uma', 'Gerente',     '1111', 'gerencia', 'uma-1,uma-off', false),
    ('uma-s1',  'uma', 'Suspensa',    '1111', 'colaborador', 'uma-1',      true);
  insert into public.users (id, company_id, name, pin, role, unit_id, suspended)
  select 'uma-c' || g, 'uma', 'Colab ' || g, '1111', 'colaborador', 'uma-1', false
    from generate_series(1, 8) g;

  insert into public.users (id, company_id, name, pin, role, unit_id, suspended) values
    ('duas-adm', 'duas', 'Dona da Duas', '1111', 'gestao', null, false),
    ('duas-s1',  'duas', 'Suspensa',     '1111', 'colaborador', 'duas-1', true);
  insert into public.users (id, company_id, name, pin, role, unit_id, suspended)
  select 'duas-c' || g, 'duas', 'Colab ' || g, '1111', 'colaborador',
         case when g <= 7 then 'duas-1' else 'duas-2' end, false
    from generate_series(1, 14) g;

  insert into public.user_requests (id, company_id, name, pin) values
    ('req-uma-nova', 'uma', 'Pessoa Nova', '4321'),
    ('req-uma-c1',   'uma', 'Colab 1',     '5555');
`);

const colunasDaView = async () => (await db.query(`
  select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'admin_company_health'
   order by ordinal_position`)).rows.map(r => r.column_name);
const colunasAntes = await colunasDaView();

console.log('═══ 10 usuários por loja + vaga adicional ═══');

// O SQL Editor aplica como postgres, sem claim.
await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
const saida = await db.exec(MIGRATION);
const diag = saida.at(-1).rows;
diag.forEach(r => console.log(`    ${r.id}: ${r.active_users}/${r.capacity} (lojas ${r.active_units}, ` +
  `franquia ${r.included_seats} + ${r.extra_seats} adicionais${r.exempt ? ', isenta' : ''}${r.excess ? `, EXCESSO ${r.excess}` : ''})`));

// ── Backfill e diagnóstico ───────────────────────────────────────────────────
const contas = (await db.query(`select company_id, exempt, extra_seats from public.billing_accounts order by 1`)).rows;
check(contas.length === 8, 'uma linha de billing_accounts por empresa existente');
check(contas.find(c => c.company_id === 'ibr')?.exempt === true
   && contas.filter(c => c.exempt).length === 2,
  'só o IBR nasce isento (cortesia ou id real)');
check(contas.find(c => c.company_id === 'ibr-li53392s')?.exempt === true,
  'o IBR de produção (ibr-li53392s, plan_tier NULL, em teste) nasce isento pelo id');
check(contas.every(c => c.extra_seats === 0), 'ninguém nasce com vaga adicional — nada é cobrado sem consentimento');

check(JSON.stringify(Object.keys(diag[0] || {})) ===
  JSON.stringify(['id', 'exempt', 'active_users', 'active_units', 'included_seats', 'extra_seats', 'capacity', 'excess']),
  'o diagnóstico volta como linha, com as colunas combinadas');
const dUma = diag.find(r => r.id === 'uma');
check(dUma?.active_users === 10 && dUma?.active_units === 1 && dUma?.capacity === 10 && dUma?.excess === 0,
  'diagnóstico da "uma": 10 ativos em 10 vagas (suspenso fora, loja desativada fora)');

// ── Lojas ativas (regra 11) ──────────────────────────────────────────────────
await db.exec(comoDono);
const lojas = async id => (await um(`select public.active_unit_count('${id}') as n`)).n;
check(await lojas('uma') === 1, 'loja desativada não conta');
check(await lojas('estreia') === 2,
  'estreia: conta a que já estreou e a sem data; a de active_from futuro e a desativada não');
check(await lojas('leste') === 1, 'active_from = hoje NO FUSO DA LOJA conta (Kiritimati, UTC+14)');
check(await lojas('oeste') === 0,
  'a mesma data numa loja em Pago Pago (UTC−11) ainda é futuro lá — não conta');
check(await lojas('fuso-ruim') === 1,
  'fuso inválido cai em America/Sao_Paulo em vez de derrubar a contagem (e o trigger)');
check(await lojas('nao-existe') === 0, 'empresa sem loja: 0 (o piso de 1 loja é da franquia, não da contagem)');

// ── company_user_quota ───────────────────────────────────────────────────────
await db.exec(como('uma', 'uma-adm', 'gestao'));
const qUma = (await um(`select public.company_user_quota() as q`)).q;
check(qUma?.active_users === 10, 'gerente de 2 lojas e diretoria de "todas" ocupam 1 vaga cada — 10, não 11');
check(qUma?.included_seats === 10 && qUma?.extra_seats === 0 && qUma?.capacity === 10 && qUma?.free_seats === 0,
  'quota da "uma": franquia 10 + 0 adicionais = 10, nenhuma livre');
check(qUma?.extra_seat_price === 17 && qUma?.exempt === false && qUma?.extra_seats_in_use === 0,
  'quota traz o preço da vaga (17), a isenção e as adicionais em uso');
check(JSON.stringify(Object.keys(qUma || {}).sort()) === JSON.stringify([
  'active_units', 'active_users', 'capacity', 'exempt', 'extra_seat_price', 'extra_seats',
  'extra_seats_in_use', 'free_seats', 'included_seats']),
  'quota devolve exatamente as chaves do contrato');

const qVizinho = (await um(`select public.company_user_quota('duas') as q`)).q;
check(qVizinho?.active_users === 10 && qVizinho?.active_units === 1,
  'authenticated pedindo a quota de OUTRA empresa recebe a própria — o parâmetro é ignorado');

await db.exec(`reset role;
  select set_config('request.jwt.claims', '{"role":"authenticated","user_id":"x"}', false);
  set role authenticated;`);
const semEmpresa = (await um(`select public.company_user_quota('duas') as q`)).q;
check(semEmpresa === null, 'token authenticated sem empresa recebe NULL, não a empresa do parâmetro');

await db.exec(comoServidor);
const qServidor = (await um(`select public.company_user_quota('duas') as q`)).q;
check(qServidor?.active_users === 15 && qServidor?.capacity === 20,
  'service_role usa o parâmetro (duas: 15 ativos em 20 vagas)');

await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
const qEditor = (await um(`select public.company_user_quota('duas') as q`)).q;
check(qEditor?.capacity === 20, 'no SQL Editor (postgres, sem claim) também usa o parâmetro');

// ── Regra 1: o 11º sem vaga é barrado ────────────────────────────────────────
await db.exec(como('uma', 'uma-adm', 'gestao'));
const onze = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-c9', 'Colab 9', '1111', 'colaborador', 'uma-1', false)`);
check(onze?.code === 'P0001' && /^ZC_QUOTA/.test(onze?.message || ''),
  'o 11º usuário de uma loja sem vaga adicional é recusado (P0001, ZC_QUOTA)');
check(onze?.message ===
  'ZC_QUOTA: Sem vaga livre — 10 de 10 vagas em uso (10 da franquia de 10 por loja + 0 adicionais). ' +
  'Contrate uma vaga adicional (R$ 17,00/mês) em Plano e vagas.',
  'a mensagem é a combinada, palavra por palavra');
const d11 = detalhe(onze);
check(d11?.capacity === 10 && d11?.active === 10 && d11?.action === 'insert',
  `detail em JSON: ${onze?.detail}`);

const onzeNulo = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-c9', 'Colab 9', '1111', 'colaborador', 'uma-1', null)`);
check(/^ZC_QUOTA/.test(onzeNulo?.message || ''), 'suspended nulo conta como ativo — também é recusado');

const aprovaNovo = await erroDe(`select public.create_user_from_request(
  'req-uma-nova', 'uma-nova', 'Pessoa Nova', 'colaborador', 'uma-1', null)`);
check(/^ZC_QUOTA/.test(aprovaNovo?.message || '') && detalhe(aprovaNovo)?.action === 'insert',
  'aprovar cadastro sem vaga (create_user_from_request) também é recusado, como insert');
check((await um(`select count(*)::int as n from public.users where id in ('uma-c9','uma-nova')`)).n === 0,
  'nada foi gravado');

// ── Com vaga adicional contratada, passa ─────────────────────────────────────
await db.exec(comoDono);
await db.exec(`update public.billing_accounts set extra_seats = 1 where company_id = 'uma'`);
await db.exec(como('uma', 'uma-adm', 'gestao'));
const comVaga = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-c9', 'Colab 9', '1111', 'colaborador', 'uma-1', false)`);
check(comVaga === null, 'com 1 vaga adicional contratada, o 11º entra');
const doze = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-c10', 'Colab 10', '1111', 'colaborador', 'uma-1', false)`);
check(doze?.message?.startsWith('ZC_QUOTA: Sem vaga livre — 11 de 11 vagas em uso (10 da franquia de 10 por loja + 1 adicionais)'),
  'e o 12º volta a ser recusado — 11 de 11');
const qCheia = (await um(`select public.company_user_quota() as q`)).q;
check(qCheia?.capacity === 11 && qCheia?.free_seats === 0 && qCheia?.extra_seats_in_use === 1,
  'quota: capacidade 11, nenhuma livre, 1 adicional em uso (o piso do downgrade)');

// ── ON CONFLICT de id existente passa (empresa cheia) ───────────────────────
const reaprova = await erroDe(`select public.create_user_from_request(
  'req-uma-c1', 'uma-c1', 'Colab Um Renomeado', 'colaborador', 'uma-1', null)`);
check(reaprova === null, 'reaprovar quem JÁ está na empresa (ON CONFLICT DO UPDATE) passa mesmo cheia');
check((await um(`select name from public.users where id = 'uma-c1'`)).name === 'Colab Um Renomeado',
  'e o upsert de fato atualizou a linha');

const upsert = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-c2', 'Colab Dois', '2222', 'colaborador', 'uma-1', false)
  on conflict (id) do update set name = excluded.name, pin = excluded.pin`);
check(upsert === null, 'upsert do app (PostgREST merge-duplicates) sobre id ativo passa');

const upsertReativa = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-s1', 'Suspensa', '1111', 'colaborador', 'uma-1', false)
  on conflict (id) do update set name = excluded.name, suspended = excluded.suspended`);
check(/^ZC_QUOTA/.test(upsertReativa?.message || '') && detalhe(upsertReativa)?.action === 'reactivate',
  'upsert que REATIVA um suspenso é pego pelo BEFORE UPDATE, já como reactivate');

const upsertSuspenso = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-s1', 'Suspensa Renomeada', '1111', 'colaborador', 'uma-1', false)
  on conflict (id) do update set name = excluded.name`);
const s1 = await um(`select name, suspended from public.users where id = 'uma-s1'`);
check(upsertSuspenso === null && s1.suspended === true && s1.name === 'Suspensa Renomeada',
  'upsert que só renomeia um suspenso passa e ele continua suspenso — não gasta vaga');

// ── Suspender libera a vaga; reativar o antigo fica bloqueado ───────────────
await db.exec(`update public.users set suspended = true where id = 'uma-c3'`);
const noLugar = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-c10', 'Colab 10', '1111', 'colaborador', 'uma-1', false)`);
check(noLugar === null, 'suspender alguém libera a vaga — o novo entra');

const reativaA = await erroDe(`update public.users set suspended = false where id = 'uma-c3'`);
check(/^ZC_QUOTA/.test(reativaA?.message || ''),
  'A suspenso, B entrou no lugar: reativar A sem vaga é bloqueado');
const dA = detalhe(reativaA);
check(dA?.action === 'reactivate' && dA?.active === 11 && dA?.capacity === 11,
  `detail da reativação: ${reativaA?.detail}`);
check((await um(`select suspended from public.users where id = 'uma-c3'`)).suspended === true,
  'e A continua suspenso');

// ── Empresa ACIMA da capacidade: editar passa, reativar não ─────────────────
// Desativar uma loja derruba a franquia para baixo do uso (regra 12 bloqueia
// isso no app, mas o banco tem de aguentar o estado — ex.: SQL manual).
await db.exec(comoDono);
await db.exec(`update public.units set active = false where id = 'duas-2'`);
await db.exec(como('duas', 'duas-adm', 'gestao'));
const qDuas = (await um(`select public.company_user_quota() as q`)).q;
check(qDuas?.active_users === 15 && qDuas?.capacity === 10, 'duas: 15 ativos em 10 vagas depois de desativar a loja 2');

// É o UPDATE que o saveUsers manda em toda edição: baseRow inteiro no SET.
const edita = await erroDe(`update public.users
   set name = 'Novo Nome', pin = '9999', role = 'lideranca', unit_id = 'duas-1',
       sector_id = 'cozinha', suspended = false, updated_at = now()
 where id = 'duas-c1'`);
check(edita === null, 'renomear / trocar PIN, papel e loja numa empresa acima da capacidade passa');
const repete = await erroDe(`update public.users set suspended = false where id = 'duas-c2'`);
check(repete === null, 'SET suspended = false em quem já era ativo não é reativação — passa');
const suspende = await erroDe(`update public.users set suspended = true where id = 'duas-c3'`);
check(suspende === null, 'suspender numa empresa acima da capacidade passa');

const reativaDuas = await erroDe(`update public.users set suspended = false where id = 'duas-s1'`);
check(/^ZC_QUOTA/.test(reativaDuas?.message || '') && detalhe(reativaDuas)?.action === 'reactivate',
  'reativar sem vaga livre é barrado (message começa com ZC_QUOTA)');

const apaga = await erroDe(`delete from public.users where id = 'duas-c14'`);
check(apaga === null, 'apagar usuário nunca é bloqueado');
const qDuasDepois = (await um(`select public.company_user_quota() as q`)).q;
check(qDuasDepois?.extra_seats_in_use === 3,
  'adicionais em uso = ativos − franquia (13 − 10 = 3): o mínimo para reduzir vagas');

// ── Troca de empresa conta como gente nova no destino ────────────────────────
await db.exec(comoDono);
const muda = await erroDe(`update public.users set company_id = 'uma' where id = 'duas-c13'`);
check(/^ZC_QUOTA/.test(muda?.message || '') && detalhe(muda)?.action === 'insert',
  'mover usuário ativo para empresa cheia é barrado (insert no destino) — vale até para o dono');
const legado = await erroDe(`insert into public.users (id, company_id, name, pin, suspended)
  values ('legado-1', null, 'Sem Empresa', '1111', false)`);
check(legado === null, 'linha legada sem company_id passa (não há contra quem contar)');

// ── Token de A mirando a empresa B: responde o RLS, não a cota de B ─────────
// O trigger roda ANTES do WITH CHECK do RLS. Contando a empresa de NEW, um
// colaborador da "uma" lia na mensagem do ZC_QUOTA os ativos, a capacidade e
// as vagas contratadas da "duas" — e a troca de erro (ZC_QUOTA × RLS) dizia se
// ela estava cheia. "duas" está acima da capacidade (13 em 10); "estreia" tem vaga (0 em 20).
await db.exec(como('uma', 'uma-c1', 'colaborador'));
const rls = e => e?.code === '42501' && /row-level security/i.test(e?.message || '');
for (const alvo of ['duas', 'estreia']) {
  const invade = await erroDe(`insert into public.users (id, company_id, name, pin, role, suspended)
    values ('espiao-${alvo}', '${alvo}', 'Espião', '1111', 'colaborador', false)`);
  check(rls(invade) && !/ZC_QUOTA/.test(invade?.message || '') && !invade?.detail,
    `INSERT com company_id '${alvo}' por token da "uma" → erro de RLS, sem ZC_QUOTA nem detail (${invade?.code})`);
  const muda = await erroDe(`update public.users set company_id = '${alvo}' where id = 'uma-c1'`);
  check(rls(muda) && !/ZC_QUOTA/.test(muda?.message || '') && !muda?.detail,
    `PATCH da própria linha para company_id '${alvo}' → erro de RLS, sem ZC_QUOTA nem detail (${muda?.code})`);
}
check((await um(`select count(*)::int as n from public.users where id like 'espiao-%'`)).n === 0
   && (await um(`select company_id from public.users where id = 'uma-c1'`)).company_id === 'uma',
  'nada foi gravado, e a linha continua na "uma"');
const naPropria = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-c12', 'Colab 12', '1111', 'colaborador', 'uma-1', false)`);
check(/^ZC_QUOTA/.test(naPropria?.message || ''),
  'na PRÓPRIA empresa o mesmo token continua barrado pela cota (a guarda é só para fora dela)');

// ── Isenta ───────────────────────────────────────────────────────────────────
await db.exec(como('ibr', 'ibr-u1', 'gestao'));
const ibr31 = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('ibr-u31', 'Pessoa 31', '1111', 'colaborador', 'ibr2', false)`);
check(ibr31 === null, 'isenta (IBR, cortesia): o 31º em 3 lojas entra');
const ibrReativa = await erroDe(`update public.users set suspended = false where id = 'ibr-s1'`);
check(ibrReativa === null, 'isenta: reativar também passa');
const qIbr = (await um(`select public.company_user_quota() as q`)).q;
check(qIbr?.exempt === true && qIbr?.active_users === 32, 'quota da isenta diz exempt = true');

// ── provision_company com 0 lojas ────────────────────────────────────────────
check(JSON.stringify(definemProvisionHoje) === JSON.stringify(DEFINEM_PROVISION),
  `as migrations que definem provision_company são as conhecidas — a viva é a de 20260720_cnpj_cadastro` +
  (JSON.stringify(definemProvisionHoje) === JSON.stringify(DEFINEM_PROVISION) ? '' : ` (hoje: ${definemProvisionHoje.join(', ')})`));

await db.exec(comoServidor);
// O payload do /comecar (api/signup/provision): CNPJ obrigatório, trial novo.
// 11.222.333/0001-81 é o CNPJ de exemplo da própria 20260720_cnpj_cadastro.
const nova = await provisiona({
  company: {
    id: 'nova', name: 'Nova', slug: 'nova-empresa', plan: 'trial',
    cnpj: '11222333000181', legal_name: 'Nova LTDA',
    contact_name: 'Dona da Nova', contact_email: 'dona@nova.test',
  },
  admin: { id: 'nova-adm', name: 'Dona da Nova', pin: '1234' },
  options: { require_cnpj: true, allow_trial_reuse: false },
});
check(nova.e === undefined, `provision_company com 0 lojas passa — a diretoria cabe no piso de 1 loja${nova.e ? `: ${nova.e.message}` : ''}`);
check(nova.r?.cnpj === '11222333000181' && nova.r?.units === 0
   && (await um(`select origin_company_id as o from public.cnpj_trial_history where cnpj_root = '11222333'`))?.o === 'nova',
  'é a provision_company VIVA (v3): grava o CNPJ e consome o trial da raiz');
const qNova = (await um(`select public.company_user_quota('nova') as q`)).q;
check(qNova?.active_users === 1 && qNova?.active_units === 0 && qNova?.included_seats === 10
   && qNova?.exempt === false,
  'empresa nova sem linha em billing_accounts: 0 lojas, 10 vagas, não isenta');

// ── Advisory lock ────────────────────────────────────────────────────────────
// PGlite é uma conexão só — não dá para disparar duas aprovações ao mesmo
// tempo. O que dá para provar é que a trava é tomada e dura a transação.
await db.exec(como('nova', 'nova-adm', 'gestao'));
await db.exec(`begin;
  insert into public.users (id, name, pin, role, suspended) values ('nova-c1', 'Colab', '1111', 'colaborador', false);`);
const travas = (await um(`select count(*)::int as n from pg_locks where locktype = 'advisory'`)).n;
const travaDaNova = await travasDaCota('nova');
const travaDeOutra = await travasDaCota('uma');
await db.exec(`commit;`);
const depoisDoCommit = (await um(`select count(*)::int as n from pg_locks where locktype = 'advisory'`)).n;
check(travas === 1 && depoisDoCommit === 0, 'pedir vaga toma um advisory lock que só solta no fim da transação');
check(travaDaNova === 1 && travaDeOutra === 0,
  "a trava do trigger é a chave do contrato, hashtext('zc_quota:' || empresa), e só da empresa que pede");

// ── Ninguém do cliente alcança as tabelas novas ──────────────────────────────
await db.exec(comoDono);
const TABELAS = `('billing_accounts','billing_checkouts','billing_seat_changes')`;
const vazou = (await um(`select count(*)::int as n from information_schema.table_privileges
  where table_schema = 'public' and table_name in ${TABELAS} and grantee in ('anon','authenticated')`)).n;
check(vazou === 0, 'anon e authenticated sem privilégio NENHUM nas 3 tabelas (os default privileges davam CRUD)');
const servidor = (await um(`select count(distinct table_name)::int as n from information_schema.table_privileges
  where table_schema = 'public' and table_name in ${TABELAS} and grantee = 'service_role'
    and privilege_type in ('SELECT','INSERT','UPDATE')`)).n;
check(servidor === 3, 'service_role lê e grava as 3');

for (const papel of ['authenticated', 'anon']) {
  await db.exec(papel === 'anon'
    ? `reset role; select set_config('request.jwt.claims', '{"role":"anon"}', false); set role anon;`
    : como('uma', 'uma-adm', 'gestao'));
  for (const t of ['billing_accounts', 'billing_checkouts', 'billing_seat_changes']) {
    const le = await erroDe(`select * from public.${t}`);
    check(/permission denied/i.test(le?.message || ''), `${papel} não lê ${t}`);
  }
  const seDaVaga = await erroDe(`update public.billing_accounts set extra_seats = 99 where company_id = 'uma'`);
  check(/permission denied/i.test(seDaVaga?.message || ''), `${papel} não se dá vaga adicional`);
}

await db.exec(comoDono);
const exec = async (papel, fn) => (await um(`select has_function_privilege('${papel}', '${fn}', 'EXECUTE') as x`)).x;
check(await exec('anon', 'public.company_user_quota(text)') === false
   && await exec('authenticated', 'public.company_user_quota(text)') === true
   && await exec('service_role', 'public.company_user_quota(text)') === true,
  'company_user_quota: authenticated e service_role executam, anon não');
check(await exec('anon', 'public.active_unit_count(text)') === false
   && await exec('authenticated', 'public.active_unit_count(text)') === false
   && await exec('service_role', 'public.active_unit_count(text)') === true,
  'active_unit_count: só service_role (o cliente contaria lojas de qualquer empresa)');
check(await exec('anon', 'public.enforce_user_seat_quota()') === false
   && await exec('authenticated', 'public.enforce_user_seat_quota()') === false,
  'a função do trigger não é executável por anon/authenticated — e o trigger dispara igual (visto acima)');

// ── admin_company_health ─────────────────────────────────────────────────────
const colunasDepois = await colunasDaView();
check(JSON.stringify(colunasDepois.slice(0, colunasAntes.length)) === JSON.stringify(colunasAntes),
  `view: as ${colunasAntes.length} colunas de antes, na mesma ordem`);
check(JSON.stringify(colunasDepois.slice(colunasAntes.length)) ===
  JSON.stringify(['active_users', 'active_units_billable', 'included_seats', 'extra_seats', 'seat_capacity']),
  'view: as 5 novas no fim');

await db.exec(comoServidor);
const hUma = await um(`select users, units, active_users, active_units_billable, included_seats,
  extra_seats, seat_capacity from public.admin_company_health where company_id = 'uma'`);
check(Number(hUma?.users) === 13 && Number(hUma?.units) === 2,
  '`users` e `units` continuam contando tudo (suspensos e loja desativada inclusos)');
check(hUma?.active_users === 11 && hUma?.active_units_billable === 1 && hUma?.included_seats === 10
   && hUma?.extra_seats === 1 && hUma?.seat_capacity === 11,
  'colunas novas da "uma": 11 ativos, 1 loja, 10 + 1 = 11 vagas — lida como service_role');
await db.exec(como('uma', 'uma-adm', 'gestao'));
const viewCliente = await erroDe(`select * from public.admin_company_health`);
check(/permission denied/i.test(viewCliente?.message || ''), 'a view segue fora do alcance do cliente');

// ── set_extra_seats: a mudança de vagas sob a trava do trigger ──────────────
// "duas" está com 13 ativos numa loja ativa (franquia 10): 3 adicionais em uso.
await db.exec(comoServidor);
const vagas = async (args) => (await um(`select public.set_extra_seats(${args}) as r`)).r;
const trilha = async id => (await um(`select count(*)::int as n from public.billing_seat_changes where company_id = '${id}'`)).n;
// `?.`: empresa sem linha em billing_accounts dá undefined (e um ✗), não um crash.
const extrasDe = async id => (await um(`select extra_seats from public.billing_accounts where company_id = '${id}'`))?.extra_seats;

const abaixo = await vagas(`'duas', 2`);
check(abaixo?.ok === false && abaixo?.reason === 'below_in_use' && abaixo?.min === 3,
  'reduzir abaixo das adicionais em uso é recusado com o mínimo contado sob a trava (3)');
const velho = await vagas(`'duas', 4, 1`);
check(velho?.ok === false && velho?.reason === 'stale' && velho?.current === 0,
  'alvo calculado em cima de um número velho (viu 1, gravado 0) → stale, nada muda');
check(await extrasDe('duas') === 0 && await trilha('duas') === 0, 'recusas não gravam vaga nem trilha');

const contrata = await vagas(`'duas', 5, 0, 'duas-adm', 'app'`);
check(contrata?.ok === true && contrata?.changed === true && contrata?.from === 0 && contrata?.to === 5,
  'contratar 5 com o número certo (0) passa');
const linha = await um(`select changed_by, from_seats, to_seats, unit_price, active_users, included_seats, source
  from public.billing_seat_changes where company_id = 'duas'`);
check(await extrasDe('duas') === 5 && linha?.changed_by === 'duas-adm' && linha?.from_seats === 0
   && linha?.to_seats === 5 && Number(linha?.unit_price) === 17 && linha?.active_users === 13
   && linha?.included_seats === 10 && linha?.source === 'app',
  'vaga e trilha do consentimento gravadas juntas (quem, de→para, R$ 17, 13 ativos, franquia 10)');
const igual = await vagas(`'duas', 5, 5`);
check(igual?.ok === true && igual?.changed === false && await trilha('duas') === 1,
  'pedir o mesmo número não grava trilha nova');
const reduz = await vagas(`'duas', 3, 5, 'duas-adm'`);
check(reduz?.ok === true && await extrasDe('duas') === 3 && await trilha('duas') === 2,
  'reduzir até as adicionais em uso (5 → 3) passa e deixa trilha');
const semConferir = await vagas(`'duas', 4`);
check(semConferir?.ok === true && await extrasDe('duas') === 4, 'sem p_expected não há conferência de número velho');

const isentaVaga = await vagas(`'ibr', 4, 0`);
check(isentaVaga?.ok === true && isentaVaga?.exempt === true && await extrasDe('ibr') === 0,
  'isenta: nada a contratar, nada muda');
check((await vagas(`'nao-existe', 1`))?.reason === 'not_found', 'empresa inexistente → not_found');
check((await vagas(`'duas', -1`))?.reason === 'invalid_seats', 'número negativo → invalid_seats');

// Empresa provisionada DEPOIS da migration não tem linha em billing_accounts —
// provision_company não cria —, e esse é o caso de TODO cadastro novo. A RPC
// cria a linha sob a trava; sem isso o UPDATE não pegaria linha nenhuma e ela
// responderia "contratado", com trilha do consentimento gravada, e a
// capacidade continuaria 10. Aqui pelo caminho do Core "sem CNPJ" (skipCnpj).
const semConta = await provisiona({
  company: { id: 'nova-2', name: 'Nova 2', slug: 'nova-2', cnpj: null, legal_name: null,
             contact_name: null, contact_email: null, contact_whatsapp: null },
  admin: { id: 'nova-2-adm', name: 'Dona da Nova 2', pin: '4321' },
  options: { require_cnpj: false, allow_trial_reuse: false },
});
check(semConta.e === undefined
   && (await um(`select count(*)::int as n from public.billing_accounts where company_id = 'nova-2'`)).n === 0,
  `empresa provisionada depois da migration (Core, sem CNPJ) nasce sem linha em billing_accounts${semConta.e ? `: ${semConta.e.message}` : ''}`);
const primeiraVaga = await vagas(`'nova-2', 2, 0, 'nova-2-adm', 'app'`);
check(primeiraVaga?.ok === true && primeiraVaga?.changed === true && primeiraVaga?.from === 0 && primeiraVaga?.to === 2
   && await extrasDe('nova-2') === 2 && await trilha('nova-2') === 1,
  'set_extra_seats numa empresa SEM linha: cria a linha, grava as 2 vagas e uma trilha');
const qNova2 = (await um(`select public.company_user_quota('nova-2') as q`)).q;
check(qNova2?.extra_seats === 2 && qNova2?.capacity === 12 && qNova2?.exempt === false,
  'e a vaga vale: capacidade 10 + 2 = 12, não isenta');

await db.exec(`begin;`);
await vagas(`'estreia', 1`);
const travaVaga = (await um(`select count(*)::int as n from pg_locks where locktype = 'advisory'`)).n;
const travaVagaChave = await travasDaCota('estreia');
await db.exec(`commit;`);
check(travaVaga === 1 && travaVagaChave === 1,
  "set_extra_seats toma a MESMA trava do trigger (hashtext('zc_quota:' || empresa)) até o fim da transação");

await db.exec(comoDono);
check(await exec('anon', 'public.set_extra_seats(text, integer, integer, text, text)') === false
   && await exec('authenticated', 'public.set_extra_seats(text, integer, integer, text, text)') === false
   && await exec('service_role', 'public.set_extra_seats(text, integer, integer, text, text)') === true,
  'set_extra_seats: só service_role executa');
await db.exec(como('duas', 'duas-adm', 'gestao'));
const clienteSeDaVaga = await erroDe(`select public.set_extra_seats('duas', 50)`);
check(/permission denied/i.test(clienteSeDaVaga?.message || ''), 'um token da empresa não se dá vaga pela RPC');

// ── Idempotência ─────────────────────────────────────────────────────────────
// Uma isenção dada pelo servidor DEPOIS do backfill (parceria, sem plan_tier
// 'cortesia') não pode ser desfeita por quem cola a migration de novo.
await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
await db.exec(`update public.billing_accounts set exempt = true where company_id = 'estreia'`);
const segunda = await erroDe(MIGRATION);
check(segunda === null, `roda 2× sem erro${segunda ? `: ${segunda.message}` : ''}`);
const depois = (await db.query(`select company_id, exempt, extra_seats from public.billing_accounts order by 1`)).rows;
check(depois.find(c => c.company_id === 'uma')?.extra_seats === 1,
  '2ª execução não zera vaga contratada');
check(depois.find(c => c.company_id === 'estreia')?.exempt === true,
  '2ª execução não recalcula isenção a partir do plan_tier');
// 8 do backfill + 'nova-2' (criada por set_extra_seats) + 'nova', que só a 2ª execução cria.
check(depois.find(c => c.company_id === 'nova') !== undefined && depois.length === 10,
  '2ª execução cria a linha que faltava (empresa nova) e não duplica nenhuma');
const gatilhos = (await um(`select count(*)::int as n from pg_trigger
  where tgrelid = 'public.users'::regclass and not tgisinternal and tgname = 'users_seat_quota'`)).n;
check(gatilhos === 1, 'um trigger só, não dois');
await db.exec(como('uma', 'uma-adm', 'gestao'));
const aindaTrava = await erroDe(`insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('uma-c11', 'Colab 11', '1111', 'colaborador', 'uma-1', false)`);
check(/^ZC_QUOTA/.test(aindaTrava?.message || ''), 'e continua travando depois da 2ª execução');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
