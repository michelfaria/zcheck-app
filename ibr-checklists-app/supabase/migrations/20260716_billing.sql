-- ============================================================================
-- 20260716_billing.sql — Trial de 7 dias + assinatura (Mercado Pago).
--
-- Até aqui uma empresa nasce com plan='trial' mas nada expira nem cobra. Esta
-- migration adiciona o estado de billing em `companies`, a auditoria de webhook,
-- o helper `company_is_active()` e o ENFORCEMENT no RLS: quando o trial vence sem
-- assinatura, as escritas das tabelas de uso do produto são negadas no banco
-- (não só na UI). Dados nunca são apagados — só o acesso de escrita é cortado.
--
-- ORDEM IMPORTA: o backfill do IBR (cortesia, sempre ativo) roda ANTES do
-- enforcement, senão o piloto em produção trava. Idempotente.
--
-- Pré-requisitos: tenant_01/02, 20260715_signups.
-- ============================================================================


-- ── (1) Colunas de billing em companies ─────────────────────────────────────
alter table public.companies add column if not exists trial_ends_at        timestamptz;
alter table public.companies add column if not exists subscription_status  text;
alter table public.companies add column if not exists plan_tier            text;
alter table public.companies add column if not exists unit_limit           integer;
alter table public.companies add column if not exists current_period_end   timestamptz;
alter table public.companies add column if not exists mp_preapproval_id    text;

-- As novas colunas herdam o SELECT de tabela que o anon já tem em companies
-- (fetchCompany roda pré-login e faz select('*')). Reafirmado aqui por garantia.
-- São metadados de estado, não dado sensível.
grant select on public.companies to anon, authenticated;


-- ── (2) BACKFILL — antes do enforcement, senão trava o piloto ───────────────
-- IBR é cortesia: sempre ativo, período distante. Nunca vê paywall.
update public.companies
   set subscription_status = 'active',
       current_period_end  = now() + interval '100 years',
       plan_tier           = coalesce(plan_tier, 'cortesia')
 where id = 'ibr';

-- Qualquer empresa já existente sem estado de billing (ex.: criada por
-- /comecar entre o deploy do signup e esta migration) entra em trial de 7 dias.
update public.companies
   set subscription_status = 'trialing',
       trial_ends_at       = now() + interval '7 days'
 where subscription_status is null;


-- ── (3) Auditoria de webhook ─────────────────────────────────────────────────
-- Só a service_role escreve/lê (nas rotas /api/billing/*). Dedup por (tipo, id)
-- torna o processamento do webhook idempotente.
create table if not exists public.billing_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  text,
  mp_type     text,          -- preapproval | authorized_payment | payment
  mp_id       text,          -- id do recurso no Mercado Pago
  status      text,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create unique index if not exists billing_events_dedup
  on public.billing_events (mp_type, mp_id);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;


-- ── (4) Helper de atividade da empresa ──────────────────────────────────────
-- SECURITY DEFINER + STABLE: lê `companies` sem recursão de RLS. Espelha o
-- billingState() do cliente (lib/plans.js). Na dúvida (status nulo/empresa não
-- encontrada) retorna TRUE — nunca bloqueia por dado incompleto.
create or replace function public.company_is_active(p_company_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select case
      -- 'active' vale até um webhook mover explicitamente para past_due/canceled.
      -- Não bloqueamos por período vencido sozinho (evita falso bloqueio na janela
      -- entre o fim do período e o webhook de renovação). Espelha billingState().
      when c.subscription_status = 'active' then true
      when c.subscription_status = 'canceled'
        and c.current_period_end is not null and c.current_period_end > now() then true
      when c.subscription_status = 'trialing'
        and c.trial_ends_at is not null and c.trial_ends_at > now() then true
      when c.subscription_status is null then true   -- legado: não bloqueia
      else false
    end
    from public.companies c
    where c.id = p_company_id
  ), true);
$$;

revoke all on function public.company_is_active(text) from public;
grant execute on function public.company_is_active(text) to anon, authenticated;


-- ── (5) ENFORCEMENT no RLS ──────────────────────────────────────────────────
-- Reaplica a política `<t>_tenant_rw` das tabelas de USO do produto acrescentando
-- `company_is_active` no WITH CHECK. Efeito: leitura/delete seguem por company_id
-- (cláusula USING inalterada), mas INSERT/UPDATE são negados quando o billing
-- venceu. Fica de fora: users, push_subscriptions, events (login e telemetria
-- precisam funcionar para o usuário chegar ao paywall) e as tabelas de metadados.
do $$
declare t text;
begin
  foreach t in array array[
    'templates', 'completions', 'photos', 'closures',
    'live_tasks', 'recognitions', 'action_plans'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_tenant_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using      (company_id = public.jwt_company_id())
        with check (company_id = public.jwt_company_id()
                    and public.company_is_active(company_id))
    $f$, t || '_tenant_rw', t);
  end loop;
end $$;


-- ── (6) provision_company — nasce em trial de 7 dias ────────────────────────
-- Reaplica a função da 20260715 (guardas de slug reservado/curto preservadas),
-- só acrescentando trial_ends_at e subscription_status no insert de companies.
create or replace function public.provision_company(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id   text := nullif(trim(p #>> '{company,id}'), '');
  v_company_name text := nullif(trim(p #>> '{company,name}'), '');
  v_slug         text := nullif(trim(p #>> '{company,slug}'), '');
  v_admin_id     text := nullif(trim(p #>> '{admin,id}'), '');
  v_admin_name   text := nullif(trim(p #>> '{admin,name}'), '');
  v_admin_pin    text := p #>> '{admin,pin}';
  v_units        int;
  v_sectors      int;
  v_types        int;
  v_reserved     text[] := array[
    'www','app','api','admin','entrar','lista','comecar','onboarding','cadastro',
    'importar','privacidade','signup','signin','login','logout','conta','account',
    'billing','dashboard','settings','ajuda','suporte','support','help','mail',
    'email','static','assets','cdn','status','blog','docs','zcheck','ingo'
  ];
begin
  if v_company_id is null or v_company_name is null or v_slug is null then
    raise exception 'company.id, company.name e company.slug são obrigatórios';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'slug inválido: use apenas minúsculas, dígitos e hífen';
  end if;
  if length(v_slug) < 3 then
    raise exception 'slug muito curto: mínimo de 3 caracteres';
  end if;
  if v_slug = any(v_reserved) then
    raise exception 'slug reservado: escolha outro nome de empresa';
  end if;
  if v_company_id !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'company.id inválido: use apenas minúsculas, dígitos e hífen';
  end if;
  if v_admin_id is null or v_admin_name is null then
    raise exception 'admin.id e admin.name são obrigatórios';
  end if;
  if v_admin_pin !~ '^\d{4}$' then
    raise exception 'admin.pin deve ter exatamente 4 dígitos';
  end if;
  if exists (select 1 from public.companies where id = v_company_id or slug = v_slug) then
    raise exception 'empresa já existe (id ou slug em uso)';
  end if;
  if exists (select 1 from public.users where id = v_admin_id) then
    raise exception 'admin.id já existe';
  end if;

  insert into public.companies
    (id, name, slug, primary_color, plan, active, subscription_status, trial_ends_at)
  values (
    v_company_id, v_company_name, v_slug,
    coalesce(nullif(p #>> '{company,primary_color}', ''), '#063C5C'),
    coalesce(nullif(p #>> '{company,plan}', ''), 'trial'),
    true,
    'trialing',
    now() + interval '7 days'
  );

  insert into public.units (id, company_id, name, color, active, sort_order)
  select u.id, v_company_id, u.name,
         coalesce(nullif(u.color, ''), '#063C5C'), true, coalesce(u.sort_order, 0)
    from jsonb_to_recordset(coalesce(p -> 'units', '[]'::jsonb))
      as u(id text, name text, color text, sort_order int)
   where nullif(trim(u.name), '') is not null;
  get diagnostics v_units = row_count;

  if v_units = 0 then
    raise exception 'a empresa precisa de ao menos uma loja';
  end if;

  insert into public.sectors (id, company_id, unit_id, name, sort_order)
  select s.id, v_company_id, s.unit_id, s.name, coalesce(s.sort_order, 0)
    from jsonb_to_recordset(coalesce(p -> 'sectors', '[]'::jsonb))
      as s(id text, unit_id text, name text, sort_order int)
   where nullif(trim(s.name), '') is not null;
  get diagnostics v_sectors = row_count;

  insert into public.checklist_types (id, company_id, name, sort_order)
  select t.id, v_company_id, t.name, coalesce(t.sort_order, 0)
    from jsonb_to_recordset(coalesce(p -> 'checklist_types', '[]'::jsonb))
      as t(id text, name text, sort_order int)
   where nullif(trim(t.name), '') is not null;
  get diagnostics v_types = row_count;

  insert into public.users (id, company_id, name, pin, role, unit_id, sector_id, suspended)
  values (v_admin_id, v_company_id, v_admin_name, v_admin_pin, 'gestao', null, null, false);

  return jsonb_build_object(
    'company_id', v_company_id,
    'slug',       v_slug,
    'units',      v_units,
    'sectors',    v_sectors,
    'types',      v_types,
    'admin_id',   v_admin_id
  );
end;
$$;

revoke all on function public.provision_company(jsonb) from public;
revoke all on function public.provision_company(jsonb) from anon, authenticated;
grant execute on function public.provision_company(jsonb) to service_role;


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) IBR nunca bloqueia:
--   select public.company_is_active('ibr');   -- true
--
-- (b) Empresa com trial vencido bloqueia escrita mas não leitura (teste com um
--     tenant de teste): um insert em completions como authenticated daquele
--     tenant deve falhar por RLS quando trial_ends_at < now(); select funciona.
--
-- (c) anon não toca billing_events:
--   set role anon; select * from public.billing_events limit 1;  -- permission denied
--   reset role;
--
-- (d) Empresa nova nasce em trial:
--   após provision_company, companies.subscription_status='trialing' e
--   trial_ends_at ≈ now()+7d.
-- ============================================================================
