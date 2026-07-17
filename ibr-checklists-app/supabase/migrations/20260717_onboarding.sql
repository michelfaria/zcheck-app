-- ============================================================================
-- 20260717_onboarding.sql — Cadastro enxuto + onboarding guiado no app.
--
-- Contexto: o /comecar coletava segmento, lojas, setores, tipos e cor em 7
-- passos, antes de a pessoa sequer ver o produto. A decisão foi inverter: o
-- cadastro fica no mínimo (e-mail → nome da empresa → gestor) e TODA a
-- configuração acontece dentro do app, num onboarding guiado onde o gestor vê o
-- resultado enquanto configura, sobe o logotipo e escolhe as cores.
--
-- Esta migration prepara o banco para isso:
--   1. `companies.onboarded_at` — marca quem já concluiu a configuração.
--   2. `provision_company` deixa de exigir ao menos uma loja (agora as lojas
--      nascem no onboarding, não no cadastro).
--   3. Bucket `company-logos` para o logotipo (leitura pública, escrita só do
--      próprio tenant).
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- Pré-requisitos: 20260715_signups, 20260716_billing.
-- ============================================================================


-- ── (1) Marca de onboarding concluído ───────────────────────────────────────
alter table public.companies add column if not exists onboarded_at timestamptz;

-- BACKFILL, antes de qualquer coisa: quem JÁ tem lojas configuradas está
-- configurado — não pode ser jogado no onboarding do nada. Cobre o IBR, a demo
-- e as empresas criadas pelo cadastro antigo (que já criava as lojas).
update public.companies c
   set onboarded_at = coalesce(c.onboarded_at, now())
 where exists (select 1 from public.units u where u.company_id = c.id);

-- As colunas novas herdam o SELECT de tabela que o anon já tem em companies
-- (fetchCompany roda pré-login com select('*')).
grant select on public.companies to anon, authenticated;


-- ── (2) provision_company sem exigir loja ───────────────────────────────────
-- Idêntica à 20260716 (guardas de slug reservado/curto, trial de 7 dias,
-- papel do admin forçado) MENOS o `raise 'a empresa precisa de ao menos uma
-- loja'`: as lojas passam a nascer no onboarding guiado, dentro do app.
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

  -- Lojas/setores/tipos seguem aceitos (o /onboarding da equipe ainda os manda),
  -- mas agora são OPCIONAIS: sem eles, a empresa nasce sem config e o app abre o
  -- onboarding guiado no primeiro acesso do gestor.
  insert into public.units (id, company_id, name, color, active, sort_order)
  select u.id, v_company_id, u.name,
         coalesce(nullif(u.color, ''), '#063C5C'), true, coalesce(u.sort_order, 0)
    from jsonb_to_recordset(coalesce(p -> 'units', '[]'::jsonb))
      as u(id text, name text, color text, sort_order int)
   where nullif(trim(u.name), '') is not null;
  get diagnostics v_units = row_count;

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

  -- Empresa provisionada COM lojas (fluxo da equipe) já nasce configurada; sem
  -- lojas, onboarded_at fica nulo e o app abre o onboarding guiado.
  if v_units > 0 then
    update public.companies set onboarded_at = now() where id = v_company_id;
  end if;

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


-- ── (3) Bucket do logotipo ──────────────────────────────────────────────────
-- Público na LEITURA: o logo aparece na tela de login, antes de existir sessão —
-- não há como exigir token para lê-lo, e ele é a marca pública da empresa.
-- Escrita restrita ao próprio tenant: o path é `{company_id}/...`, e a policy
-- compara a primeira pasta com o company_id do token. Assim uma empresa não
-- sobrescreve o logo de outra.
insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do update set public = true;

drop policy if exists company_logos_public_read on storage.objects;
create policy company_logos_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'company-logos');

drop policy if exists company_logos_tenant_insert on storage.objects;
create policy company_logos_tenant_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = public.jwt_company_id()
  );

drop policy if exists company_logos_tenant_update on storage.objects;
create policy company_logos_tenant_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = public.jwt_company_id()
  )
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = public.jwt_company_id()
  );


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Ninguém que já usa o produto cai no onboarding sem motivo:
--   select id, onboarded_at from public.companies order by id;
--   -- esperado: ibr / demo / hotel-teste com onboarded_at PREENCHIDO
--
-- (b) Empresa nova nasce sem config e sem onboarded_at:
--   -- após um cadastro pelo /comecar enxuto:
--   select id, onboarded_at from public.companies where slug = '<nova>';
--   -- esperado: onboarded_at NULL
--   select count(*) from public.units where company_id = '<id da nova>';  -- 0
--
-- (c) provision_company aceita payload sem lojas (rode como service_role):
--   select public.provision_company(
--     '{"company":{"id":"abc-teste","name":"ABC","slug":"abc-teste"},
--       "admin":{"id":"abc-adm","name":"N","pin":"1234"}}'::jsonb);
--   -- esperado: sucesso, units = 0 (antes: erro "precisa de ao menos uma loja")
--   -- limpe depois: delete from users where id='abc-adm';
--   --               delete from companies where id='abc-teste';
--
-- (d) O bucket é público na leitura e fechado na escrita cross-tenant:
--   set role anon;
--   insert into storage.objects (bucket_id, name) values ('company-logos','x/y.png');
--   -- esperado: permission denied / violação de policy
--   reset role;
-- ============================================================================
