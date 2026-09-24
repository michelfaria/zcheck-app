-- ============================================================================
-- 20260923_limite_usuarios.sql — 10 usuários por loja + vaga adicional
--                                 (R$ 17,00/mês), com a trava NO BANCO.
--
-- ── A regra (decisões do Michel, 23/09/2026) ───────────────────────────────
--   · Cada loja ATIVA inclui 10 vagas, e a franquia é SOMADA na empresa:
--     1 loja = 10, 2 lojas = 20, 3 lojas = 30. Piso de 1 loja: empresa com 0
--     lojas ativas tem 10 vagas — a diretoria que o provision_company cria
--     antes de existir loja sempre cabe.
--   · Loja ativa = `units.active` E já estreou (`active_from` nulo ou ≤ hoje
--     NO FUSO DA LOJA, `units.timezone`). A MESMA contagem vale para a
--     cobrança: é o que os Termos prometem ("a cobrança acompanha as unidades
--     ativas").
--   · Ocupa vaga todo usuário NÃO suspenso, de qualquer papel. Diretoria de
--     "todas as lojas" e gerente de várias lojas ocupam 1 vaga só (a conta é
--     por LINHA de `users`, nunca por loja de `unit_id`). Pedido de cadastro
--     pendente (`user_requests`) não ocupa vaga.
--   · Vaga adicional = vaga CONTRATADA (`billing_accounts.extra_seats`),
--     R$ 17,00/mês nos dois ciclos. A fatura segue o CONTRATADO, não o uso:
--     suspender libera a vaga para outra pessoa, mas não baixa a fatura.
--   · Criar/aprovar sem vaga → o app oferece contratar +1 (só a diretoria).
--     Reativar suspenso sem vaga → bloqueio; contratar primeiro.
--   · IBR (plan_tier 'cortesia') é isento: sem trava e sem cobrança. Sem
--     grandfathering — o Mercado Pago ainda está em TEST, sem cliente pagante.
--   A conta de preço mora em lib/plans.js (INCLUDED_USERS_PER_UNIT = 10,
--   EXTRA_USER_PRICE = 17). O 10 e o 17 daqui são ESPELHO dela: mudou lá,
--   muda aqui na mesma entrega.
--
-- ── Por que a trava é um trigger, e não a tela ─────────────────────────────
-- Os caminhos que criam ou reativam usuário:
--   1. o app, INSERT/UPDATE direto via PostgREST (lib/sync.js saveUsers) — e a
--      policy `users_tenant_rw` só confere company_id, sem papel: qualquer
--      token da empresa, até de colaborador, escreve em `users` pela REST;
--   2. `create_user_from_request` (aprovação de cadastro, security definer);
--   3. `provision_company` (service_role: /onboarding, /comecar e o Core).
-- Uma checagem só na tela seria contornada pelo 1 com um curl e nem veria o 2
-- e o 3. O trigger `users_seat_quota` pega todos — RLS, security definer e
-- service_role.
--
-- ── Os três cuidados que o trigger toma (cada um evita um falso bloqueio) ──
--   a) Só age quando a linha PASSA a ocupar vaga. O app manda `suspended`,
--      `role` e `unit_id` no SET de TODO update (renomear, trocar PIN), e
--      `UPDATE OF suspended` dispara mesmo sem mudança: sem comparar OLD e NEW,
--      uma empresa acima da capacidade (loja desativada, por exemplo) não
--      conseguiria nem corrigir o nome de alguém.
--   b) BEFORE INSERT dispara ANTES da resolução do ON CONFLICT. A aprovação
--      (`create_user_from_request`) faz INSERT ... ON CONFLICT (id) DO UPDATE:
--      sem olhar se o id já existe na empresa, reaprovar alguém que já está lá
--      seria cobrado como gente nova.
--   c) Advisory lock por empresa antes de contar: duas aprovações ao mesmo
--      tempo passariam as duas pela contagem e estourariam a capacidade.
-- E um cuidado de sigilo: linha de OUTRA empresa escrita por token do cliente
-- não é contada — o RLS a recusa depois, e a mensagem do ZC_QUOTA não vaza a
-- ocupação nem as vagas contratadas do vizinho (ver a função, seção 6).
--
-- ── O erro ─────────────────────────────────────────────────────────────────
-- SQLSTATE P0001, message começando por `ZC_QUOTA:` (é o prefixo que o
-- cliente procura em error.message) e `detail` em JSON:
--   {"capacity":N,"active":N,"action":"insert"|"reactivate"}
-- O texto é para gente — lib/sync.js mostra error.message como vem.
--
-- ── O que esta migration cria ──────────────────────────────────────────────
--   (1) billing_accounts      — vagas contratadas, isenção e o que o MP cobra
--   (2) billing_checkouts     — a INTENÇÃO de cada checkout (lojas, vagas,
--                               ciclo, valor), achada pelo webhook pelo id do
--                               preapproval. Existe porque o valor não
--                               identifica o plano: anual 2 lojas + 11 vagas
--                               = 2×97 + 11×17 = 381 = mensal 3 lojas.
--   (3) billing_seat_changes  — a trilha do consentimento: quem mudou as
--                               vagas contratadas, de quanto para quanto, a
--                               que preço e com quantos em uso.
--   (4) active_unit_count()   — a contagem de lojas ativas (regra acima)
--   (5) company_user_quota()  — o estado de vagas que o app e o servidor leem
--   (6) trigger users_seat_quota → enforce_user_seat_quota()
--   (7) admin_company_health  — ganha 5 colunas NO FIM
--   (8) set_extra_seats()     — a mudança de vagas contratadas, atômica e sob
--                               a MESMA trava do trigger (só service_role)
--
-- ── Segurança ──────────────────────────────────────────────────────────────
--   · As três tabelas são SÓ do servidor (service_role). Os default privileges
--     do Supabase dão SELECT/INSERT/UPDATE/DELETE a anon e authenticated em
--     toda tabela nova de public (20260808_revoke_truncate_publico só tirou
--     TRUNCATE/TRIGGER/REFERENCES) — daí o `revoke all` explícito em cada uma.
--   · A isenção e as vagas contratadas NÃO moram em `companies` de propósito:
--     `companies_tenant_rw` é FOR ALL para authenticated, só por id, e o
--     authenticated tem UPDATE de tabela ali — qualquer token da empresa, até
--     de colaborador, escreveria o próprio plan_tier. Por isso `plan_tier` só
--     é lido UMA vez, no backfill abaixo; em tempo de execução quem manda é
--     `billing_accounts.exempt`, que o cliente não alcança. Empresa cortesia
--     criada DEPOIS desta migration precisa da linha gravada pelo servidor.
--   · Empresa sem linha em billing_accounts (criada depois desta migration)
--     vale como NÃO isenta e 0 vagas adicionais — o servidor cria a linha no
--     primeiro checkout ou na primeira mudança de vagas.
--   · Funções security definer com `search_path = public`, revoke de public e
--     de anon (os default privileges também dão EXECUTE ao anon em função nova
--     — ver 20260726_tenant_03e), e grant só de quem precisa.
--   · O repositório é PÚBLICO: nada de segredo aqui, e nenhum tenant citado
--     além do IBR ('ibr' nas migrations anteriores; 'ibr-li53392s', o id real,
--     já em docs/PLANO_CONSOLIDACAO_ABAS.md). O diagnóstico
--     do fim lista as empresas NA TELA do SQL Editor, não neste arquivo.
--
-- ── Para conferir depois de aplicar ────────────────────────────────────────
--   · A coluna `exempt` do diagnóstico: o backfill confia no plan_tier de
--     HOJE (gravável pelo tenant, ver acima) e no id do IBR. Só o IBR
--     (`ibr-li53392s`) deve sair isento; qualquer outra `true` é para
--     investigar antes de seguir.
--   · A coluna `excess`: empresa com mais ativos que capacidade não é
--     bloqueada em nada que já existe (o trigger só olha quem ENTRA), mas não
--     cria nem reativa ninguém até contratar vagas ou suspender alguém.
--   · `admin_delete_company` apaga toda tabela de public com coluna
--     `company_id` — as três tabelas novas vão junto com a empresa.
--
-- ── Ordem de deploy ────────────────────────────────────────────────────────
-- ESTA MIGRATION PRIMEIRO, depois o código. O app tolera a ausência de
-- `company_user_quota` (sem medidor, sem trava no cliente), mas o checkout e o
-- webhook novos gravam em billing_checkouts/billing_accounts.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente: roda 2× sem erro e sem mexer no que já foi gravado (o backfill
-- é `on conflict do nothing` — vagas contratadas e isenção sobrevivem).
-- Pré-requisitos: 20260709_tenant_01_company_id (jwt_company_id),
--                 20260716_billing (companies.plan_tier),
--                 20260719_admin_views (admin_company_health),
--                 20260727_units_timezone, 20260815_units_active_from.
--
-- TESTADA com PGlite: node supabase/migrations/20260923_limite_usuarios.test.mjs
-- ============================================================================


-- ── (1) billing_accounts — o contrato de vagas de cada empresa ─────────────
create table if not exists public.billing_accounts (
  company_id          text primary key,
  -- Isenta = sem trava e sem cobrança (cortesia/parceria). Só o servidor grava.
  exempt              boolean not null default false,
  -- Vagas ADICIONAIS contratadas (além da franquia de 10 por loja ativa). É o
  -- que a fatura cobra — não o uso. Reduzir nunca abaixo das em uso é regra de
  -- set_extra_seats() (seção 8), por onde o servidor muda este número; aqui
  -- só se garante que não fica negativo.
  extra_seats         integer not null default 0
                        constraint billing_accounts_extra_seats_nonneg check (extra_seats >= 0),
  -- O que o Mercado Pago está cobrando DE FATO (último valor aplicado no
  -- preapproval). Nulo = nunca cobrado (trial, cortesia).
  billed_units        integer,
  billed_extra_seats  integer,
  billed_amount       numeric(10,2),
  billed_cycle        text
                        constraint billing_accounts_billed_cycle_valid
                        check (billed_cycle in ('annual', 'monthly')),
  -- Mudou vaga ou loja com o ajuste do MP desligado (MP_ADJUST_ENABLED): o
  -- valor cobrado está defasado e alguém precisa olhar.
  adjust_pending      boolean not null default false,
  updated_at          timestamptz not null default now()
);

comment on table public.billing_accounts is
  'Vagas de usuário contratadas e o que o Mercado Pago cobra, por empresa. '
  'Só service_role. Ver 20260923_limite_usuarios.sql e lib/plans.js.';

alter table public.billing_accounts enable row level security;
revoke all on public.billing_accounts from anon, authenticated;
grant select, insert, update, delete on public.billing_accounts to service_role;

-- Backfill: uma linha por empresa que já existe. `do nothing` é o que torna a
-- migration re-executável: rodar de novo não zera vaga contratada nem isenção.
-- extra_seats começa em 0 para TODOS — ninguém passa a ser cobrado por vaga
-- sem ter contratado. Quem já está acima da franquia aparece no diagnóstico.
-- O IBR entra isento PELO ID, não só pelo plan_tier: em produção o tenant do
-- piloto é `ibr-li53392s` (criado pelo /comecar em 29/07/2026, plan_tier
-- NULL, status 'trialing' — conferido no SQL Editor em 24/09/2026), e o
-- backfill 'cortesia' de 20260716 mirava o id 'ibr', que não existe lá.
insert into public.billing_accounts (company_id, exempt)
select c.id, coalesce(c.plan_tier = 'cortesia', false) or c.id in ('ibr', 'ibr-li53392s')
  from public.companies c
on conflict (company_id) do nothing;


-- ── (2) billing_checkouts — a intenção de cada checkout ────────────────────
-- Gravada pelo /api/billing/checkout ANTES de devolver o init_point; lida pelo
-- webhook pelo id do preapproval. Sem ela, o webhook teria de adivinhar lojas
-- e vagas pelo valor — e 381 é tanto "anual, 2 lojas + 11 vagas" quanto
-- "mensal, 3 lojas".
create table if not exists public.billing_checkouts (
  mp_preapproval_id  text primary key,
  company_id         text not null,
  cycle              text,
  units              integer,
  extra_seats        integer,
  amount             numeric(10,2),
  created_at         timestamptz not null default now()
);

create index if not exists billing_checkouts_company_idx
  on public.billing_checkouts (company_id, created_at desc);

alter table public.billing_checkouts enable row level security;
revoke all on public.billing_checkouts from anon, authenticated;
grant select, insert, update, delete on public.billing_checkouts to service_role;


-- ── (3) billing_seat_changes — a trilha do consentimento ───────────────────
-- Toda mudança de vagas contratadas vira linha: quem (id do token), de quanto
-- para quanto, a que preço e com quantos em uso naquele momento. É a prova de
-- que a vaga cobrada foi pedida por alguém da diretoria.
create table if not exists public.billing_seat_changes (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null,
  changed_by      text,
  from_seats      integer,
  to_seats        integer,
  unit_price      numeric(10,2),
  active_users    integer,
  included_seats  integer,
  source          text,             -- 'app' | 'checkout' | 'core' ...
  created_at      timestamptz not null default now()
);

create index if not exists billing_seat_changes_company_idx
  on public.billing_seat_changes (company_id, created_at desc);

alter table public.billing_seat_changes enable row level security;
revoke all on public.billing_seat_changes from anon, authenticated;
grant select, insert, update, delete on public.billing_seat_changes to service_role;


-- ── (4) active_unit_count — quantas lojas contam ───────────────────────────
-- Ativa = `active` E já estreou no relógio DA LOJA. "Hoje" é o dia do fuso de
-- cada loja (lib/dates.js: todayStr(tzOf(unit))), nunca o do servidor: uma
-- loja em Manaus com estreia amanhã não pode contar às 23h de Brasília.
--
-- Fuso inválido em `units.timezone` (não há CHECK de propósito — ver
-- 20260727_units_timezone) cai em America/Sao_Paulo, como `tzOf()` no app.
-- Sem esse fallback, UMA loja com fuso digitado errado derrubaria o trigger
-- e ninguém mais seria criado na empresa.
--
-- Security definer: é chamada de dentro do trigger e da quota, e precisa ver
-- todas as lojas da empresa sem depender do RLS de quem escreveu.
create or replace function public.active_unit_count(p_company_id text)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_n    integer := 0;
  v_u    record;
  v_hoje date;
begin
  for v_u in
    select un.active_from, un.timezone
      from public.units un
     where un.company_id = p_company_id
       and un.active is true
  loop
    -- Sem data de estreia = sempre ativa (o parque inteiro anterior a 15/08).
    if v_u.active_from is null then
      v_n := v_n + 1;
      continue;
    end if;
    begin
      v_hoje := (now() at time zone coalesce(nullif(btrim(v_u.timezone), ''), 'America/Sao_Paulo'))::date;
    exception when invalid_parameter_value then
      v_hoje := (now() at time zone 'America/Sao_Paulo')::date;
    end;
    if v_u.active_from <= v_hoje then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Só o servidor chama direto (a view do Core e o cron de billing rodam como
-- service_role). O cliente lê a contagem por company_user_quota(), que já
-- prende a empresa ao token — daqui ele contaria as lojas de QUALQUER empresa.
revoke all on function public.active_unit_count(text) from public;
revoke all on function public.active_unit_count(text) from anon, authenticated;
grant execute on function public.active_unit_count(text) to service_role;


-- ── (5) company_user_quota — o estado de vagas, para o app e o servidor ────
-- Quem é `authenticated` recebe SEMPRE a própria empresa (jwt_company_id): o
-- parâmetro é ignorado, e token sem empresa recebe NULL — não existe "ler a
-- quota do vizinho". service_role e o SQL Editor (postgres) usam o parâmetro.
--
-- O papel vem de `current_setting('role')`, que o PostgREST fixa por request
-- e que o security definer NÃO troca (só troca current_user), e também do
-- claim `role` do token. Qualquer um dos dois dizendo authenticated/anon
-- basta para prender à empresa do token.
--
-- Com `exempt = true` os números são só informativos: o trigger não trava.
-- NULL = empresa não resolvida ou inexistente; o cliente trata como "sem
-- medidor e sem trava" (o mesmo de quando a migration não foi aplicada).
create or replace function public.company_user_quota(p_company_id text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_claims    jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_db_role   text  := current_setting('role', true);
  v_client    boolean;
  v_company   text;
  v_exempt    boolean;
  v_extra     integer;
  v_units     integer;
  v_included  integer;
  v_capacity  integer;
  v_active    integer;
begin
  v_client := coalesce(v_db_role in ('authenticated', 'anon'), false)
           or coalesce(v_claims ->> 'role' in ('authenticated', 'anon'), false);

  -- `v_claims` nulo = sessão sem request do PostgREST (SQL Editor). Ali o
  -- jwt_company_id() nem é chamado: com o GUC vazio ('') o cast dele quebra.
  if v_claims is not null then
    v_company := public.jwt_company_id();
  end if;

  if v_company is null and not v_client then
    v_company := nullif(btrim(p_company_id), '');
  end if;

  if v_company is null
     or not exists (select 1 from public.companies c where c.id = v_company) then
    return null;
  end if;

  select ba.exempt, ba.extra_seats
    into v_exempt, v_extra
    from public.billing_accounts ba
   where ba.company_id = v_company;

  v_exempt   := coalesce(v_exempt, false);
  v_extra    := greatest(coalesce(v_extra, 0), 0);
  v_units    := public.active_unit_count(v_company);
  v_included := 10 * greatest(1, v_units);        -- INCLUDED_USERS_PER_UNIT, piso de 1 loja
  v_capacity := v_included + v_extra;

  select count(*)::int
    into v_active
    from public.users u
   where u.company_id = v_company
     and not coalesce(u.suspended, false);

  return jsonb_build_object(
    'active_users',       v_active,
    'active_units',       v_units,
    'included_seats',     v_included,
    'extra_seats',        v_extra,
    'capacity',           v_capacity,
    'free_seats',         greatest(0, v_capacity - v_active),
    'extra_seat_price',   17,                     -- EXTRA_USER_PRICE
    'exempt',             v_exempt,
    -- O piso do downgrade: vagas adicionais que JÁ têm gente dentro.
    'extra_seats_in_use', greatest(0, v_active - v_included)
  );
end;
$$;

revoke all on function public.company_user_quota(text) from public;
revoke all on function public.company_user_quota(text) from anon;
grant execute on function public.company_user_quota(text) to authenticated, service_role;


-- ── (6) O trigger — a trava de verdade ─────────────────────────────────────
-- Transições que PEDEM vaga (e as únicas que podem ser recusadas):
--   · INSERT de linha ativa (suspended false/nulo) cujo id ainda não está
--     nesta empresa                                        → action 'insert'
--   · UPDATE de suspended true → false, mesma empresa     → action 'reactivate'
--   · UPDATE que troca company_id com a linha ativa       → action 'insert'
--     (para a empresa de destino é gente nova)
-- Todo o resto passa sem contar: renomear, trocar PIN, papel ou loja,
-- `SET suspended = false` em quem já era ativo, suspender. DELETE não tem
-- trigger — apagar nunca é bloqueado.
--
-- INSERT de id que JÁ existe nesta empresa passa aqui mesmo se a linha
-- existente estiver suspensa: um INSERT desses ou falha por chave duplicada,
-- ou não faz nada (ON CONFLICT DO NOTHING), ou vira UPDATE — e se esse UPDATE
-- reativar (`SET suspended = excluded.suspended`), quem confere é o BEFORE
-- UPDATE OF suspended, já como 'reactivate'. Contar no INSERT cobraria vaga
-- por um upsert que deixa a pessoa suspensa (o ON CONFLICT da aprovação não
-- mexe em `suspended`).
--
-- Linha de OUTRA empresa escrita por um token do cliente passa direto, sem
-- contar: quem a recusa é o RLS (`users_tenant_rw`, WITH CHECK), e o RLS só é
-- conferido DEPOIS dos triggers BEFORE ROW. Contando antes, um colaborador de
-- A que mandasse `company_id: 'b'` (INSERT, ou PATCH da própria linha) lia na
-- mensagem do ZC_QUOTA os ativos, a capacidade e as vagas contratadas de B —
-- e a diferença entre "ZC_QUOTA" (B cheia) e "violação de RLS" (B com vaga ou
-- isenta) já dizia qual era o caso. O papel vem do mesmo lugar que em
-- company_user_quota (current_setting('role') e o claim `role`). service_role
-- (provision_company) e a aprovação (create_user_from_request, que grava a
-- empresa de quem aprova) continuam contados.
create or replace function public.enforce_user_seat_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims    jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_client    boolean;
  v_action    text;
  v_exempt    boolean;
  v_extra     integer;
  v_included  integer;
  v_capacity  integer;
  v_active    integer;
begin
  v_client := coalesce(current_setting('role', true) in ('authenticated', 'anon'), false)
           or coalesce(v_claims ->> 'role' in ('authenticated', 'anon'), false);
  -- Token do cliente escrevendo fora da própria empresa: o RLS responde.
  -- (Sem claim, jwt_company_id() nem é chamado — com o GUC '' o cast quebra.)
  if v_client and NEW.company_id is distinct from
       (case when v_claims is not null then public.jwt_company_id() end) then
    return NEW;
  end if;

  -- A linha, depois desta escrita, não ocupa vaga: nada a conferir.
  if coalesce(NEW.suspended, false) then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if exists (select 1 from public.users u
                where u.id = NEW.id
                  and u.company_id = NEW.company_id) then
      return NEW;
    end if;
    v_action := 'insert';
  elsif OLD.company_id is distinct from NEW.company_id then
    v_action := 'insert';
  elsif coalesce(OLD.suspended, false) then
    v_action := 'reactivate';
  else
    return NEW;                 -- já ocupava vaga aqui: nome, PIN, papel, loja
  end if;

  -- Legado sem empresa: não há contra quem contar.
  if NEW.company_id is null then
    return NEW;
  end if;

  select ba.exempt into v_exempt
    from public.billing_accounts ba
   where ba.company_id = NEW.company_id;
  if coalesce(v_exempt, false) then
    return NEW;
  end if;

  -- Serializa quem pede vaga na MESMA empresa até o fim da transação. O
  -- segundo espera o primeiro gravar e conta já com ele.
  perform pg_advisory_xact_lock(hashtext('zc_quota:' || NEW.company_id));

  -- Lido DEPOIS do lock: se a diretoria acabou de contratar vaga, vale já — e
  -- uma redução em andamento (set_extra_seats, mesma chave) termina antes.
  select ba.extra_seats into v_extra
    from public.billing_accounts ba
   where ba.company_id = NEW.company_id;

  v_extra    := greatest(coalesce(v_extra, 0), 0);
  v_included := 10 * greatest(1, public.active_unit_count(NEW.company_id));
  v_capacity := v_included + v_extra;

  -- A própria linha fica de fora: no UPDATE ela pode já estar contada como
  -- suspensa (não entra) e no INSERT ainda não existe.
  select count(*)::int
    into v_active
    from public.users u
   where u.company_id = NEW.company_id
     and not coalesce(u.suspended, false)
     and u.id is distinct from NEW.id;

  if v_active + 1 > v_capacity then
    raise exception using
      errcode = 'P0001',
      message = format(
        'ZC_QUOTA: Sem vaga livre — %s de %s vagas em uso (%s da franquia de 10 por loja + %s adicionais). '
        'Contrate uma vaga adicional (R$ 17,00/mês) em Plano e vagas.',
        v_active, v_capacity, v_included, v_extra),
      detail = format('{"capacity":%s,"active":%s,"action":"%s"}',
        v_capacity, v_active, v_action);
  end if;

  return NEW;
end;
$$;

-- Função de trigger não é chamável direto; o revoke é higiene, e o trigger
-- dispara igual para quem escreve (o Postgres não confere EXECUTE da função
-- de trigger na hora do disparo).
revoke all on function public.enforce_user_seat_quota() from public;
revoke all on function public.enforce_user_seat_quota() from anon, authenticated;

drop trigger if exists users_seat_quota on public.users;
create trigger users_seat_quota
  before insert or update of suspended, company_id on public.users
  for each row execute function public.enforce_user_seat_quota();


-- ── (7) admin_company_health — vagas no Core ───────────────────────────────
-- `create or replace view` só aceita coluna nova NO FIM, com as existentes na
-- mesma ordem e tipo. As 13 primeiras são as de 20260719_admin_views, sem
-- mudança; as 5 últimas são novas.
--   · `users` segue contando TODAS as linhas (suspensos e diretoria inclusos)
--     — é o número que o Core já mostra; `active_users` é o que ocupa vaga.
--   · `units` segue contando todas; `active_units_billable` é a regra de loja
--     ativa (a mesma da cobrança).
-- Se o CREATE OR REPLACE falhar com "cannot drop columns from view" / "cannot
-- change name of view column", a view em produção divergiu do repositório:
-- confira com pg_get_viewdef('public.admin_company_health') antes de mexer.
create or replace view public.admin_company_health as
select co.id   as company_id,
       co.name, co.slug, co.active, co.plan, co.subscription_status,
       co.trial_ends_at, co.onboarded_at,
       (select count(*) from public.units u  where u.company_id = co.id)  as units,
       (select count(*) from public.users us where us.company_id = co.id) as users,
       greatest(
         (select max(e.occurred_at) from public.events e where e.company_id = co.id),
         (select max(c.completed_at::timestamptz) from public.completions c where c.company_id = co.id)
       ) as last_activity,
       (select count(*) from public.completions c
         where c.company_id = co.id
           and c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 7)  as completions_7d,
       (select count(*) from public.completions c
         where c.company_id = co.id
           and c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 30) as completions_30d,
       vg.active_users,
       vg.active_units                    as active_units_billable,
       vg.included_seats,
       vg.extra_seats,
       vg.included_seats + vg.extra_seats as seat_capacity
  from public.companies co
  cross join lateral (
    select a.active_users,
           a.active_units,
           10 * greatest(1, a.active_units) as included_seats,
           greatest(coalesce((select ba.extra_seats from public.billing_accounts ba
                               where ba.company_id = co.id), 0), 0) as extra_seats
      from (select (select count(*)::int from public.users us
                     where us.company_id = co.id
                       and not coalesce(us.suspended, false)) as active_users,
                   public.active_unit_count(co.id)             as active_units) a
  ) vg;

-- `create or replace` preserva o ACL da view; reafirmado por garantia.
revoke all on public.admin_company_health from anon, authenticated;


-- ── (8) set_extra_seats — mudar as vagas contratadas sem corrida ───────────
-- A rota /api/billing/seats (e o checkout) mudam `billing_accounts.extra_seats`.
-- Ler a cota, validar e gravar em três passos soltos tem uma janela: entre a
-- leitura ("0 adicionais em uso, dá para reduzir a 3") e a gravação, o trigger
-- aceita um 21º usuário contra a capacidade ANTIGA — e a redução deixa gente
-- ativa sem vaga (a regra 5 diz: nunca abaixo das adicionais em uso). Aqui a
-- conta e a gravação acontecem sob o MESMO advisory lock que o trigger toma:
-- quem pede vaga espera a redução terminar e conta já com ela, e vice-versa.
--
-- `p_expected` é o número de vagas que o aparelho VIU antes de pedir a mudança.
-- Diferente do gravado = outra sessão mudou no meio (duas diretorias ao mesmo
-- tempo): recusa com 'stale' em vez de aplicar um alvo absoluto calculado em
-- cima de um número velho — "+1" sobre 8 que já era 5 contrataria 4 vagas por
-- um clique que consentiu com uma. Nulo = sem essa conferência.
--
-- A trilha do consentimento (billing_seat_changes) é gravada na MESMA
-- transação: mudança de vaga sem trilha não existe, e trilha sem mudança também
-- não. Empresa isenta: nada muda (não há o que contratar).
--
-- Devolve jsonb {ok, reason?, min?, current?, exempt?, changed, from, to,
-- active_users, active_units, included_seats}. Só o servidor chama: o cliente
-- não pode se dar vaga (as tabelas de billing são fechadas para ele).
create or replace function public.set_extra_seats(
  p_company_id text,
  p_to         integer,
  p_expected   integer default null,
  p_changed_by text    default null,
  p_source     text    default 'app'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exempt    boolean;
  v_from      integer;
  v_units     integer;
  v_included  integer;
  v_active    integer;
  v_min       integer;
begin
  if p_company_id is null
     or not exists (select 1 from public.companies c where c.id = p_company_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_to is null or p_to < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_seats');
  end if;

  -- A mesma chave do trigger users_seat_quota.
  perform pg_advisory_xact_lock(hashtext('zc_quota:' || p_company_id));

  -- Empresa criada depois do backfill ainda não tem linha: nasce não isenta e
  -- com 0 adicionais, como o resto do sistema a trata.
  insert into public.billing_accounts (company_id) values (p_company_id)
  on conflict (company_id) do nothing;

  select ba.exempt, ba.extra_seats
    into v_exempt, v_from
    from public.billing_accounts ba
   where ba.company_id = p_company_id
     for update;

  v_from := greatest(coalesce(v_from, 0), 0);
  if coalesce(v_exempt, false) then
    return jsonb_build_object('ok', true, 'exempt', true, 'changed', false, 'from', v_from, 'to', v_from);
  end if;

  if p_expected is not null and p_expected <> v_from then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current', v_from);
  end if;

  v_units    := public.active_unit_count(p_company_id);
  v_included := 10 * greatest(1, v_units);        -- INCLUDED_USERS_PER_UNIT, piso de 1 loja
  select count(*)::int
    into v_active
    from public.users u
   where u.company_id = p_company_id
     and not coalesce(u.suspended, false);
  v_min := greatest(0, v_active - v_included);

  if p_to < v_min then
    return jsonb_build_object('ok', false, 'reason', 'below_in_use', 'min', v_min, 'current', v_from);
  end if;

  if p_to <> v_from then
    update public.billing_accounts
       set extra_seats = p_to, updated_at = now()
     where company_id = p_company_id;
    insert into public.billing_seat_changes
      (company_id, changed_by, from_seats, to_seats, unit_price, active_users, included_seats, source)
    values
      (p_company_id, p_changed_by, v_from, p_to, 17, v_active, v_included, coalesce(p_source, 'app'));
  end if;

  return jsonb_build_object(
    'ok', true, 'changed', p_to <> v_from, 'from', v_from, 'to', p_to,
    'active_users', v_active, 'active_units', v_units, 'included_seats', v_included);
end;
$$;

revoke all on function public.set_extra_seats(text, integer, integer, text, text) from public;
revoke all on function public.set_extra_seats(text, integer, integer, text, text) from anon, authenticated;
grant execute on function public.set_extra_seats(text, integer, integer, text, text) to service_role;


-- ── Resultado ───────────────────────────────────────────────────────────────
-- O SQL Editor descarta `raise notice`; o diagnóstico volta como linha.
-- Uma linha por empresa. `excess` > 0 = mais gente ativa que vaga: não
-- bloqueia quem já está lá, mas trava criação e reativação até contratar.
select co.id,
       (q ->> 'exempt')::boolean                                          as exempt,
       (q ->> 'active_users')::int                                        as active_users,
       (q ->> 'active_units')::int                                        as active_units,
       (q ->> 'included_seats')::int                                      as included_seats,
       (q ->> 'extra_seats')::int                                         as extra_seats,
       (q ->> 'capacity')::int                                            as capacity,
       greatest(0, (q ->> 'active_users')::int - (q ->> 'capacity')::int) as excess
  from public.companies co
  cross join lateral (select public.company_user_quota(co.id) as q) x
 order by excess desc, co.id;
