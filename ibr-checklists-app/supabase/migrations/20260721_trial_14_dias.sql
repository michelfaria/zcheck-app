-- ============================================================================
-- 20260721_trial_14_dias.sql — Trial passa de 7 para 14 dias.
--
-- Parte da reestruturação de preços/transparência de 21/07/2026: o site passa a
-- prometer "14 dias grátis, sem cartão". Esta migration redefine
-- provision_company (idêntica à 20260717_onboarding) trocando APENAS o
-- `interval '7 days'` por `interval '14 days'`.
--
-- Vale só para empresas NOVAS. Trials em andamento não são alterados aqui;
-- para estender um trial ativo use o ZCheck Core (ação extend_trial).
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- Pré-requisito: 20260717_onboarding.
-- ============================================================================

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
    now() + interval '14 days'
  );

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

-- ============================================================================
-- VERIFICAÇÃO
--   -- após um cadastro de teste pelo /comecar:
--   select slug, trial_ends_at - now() from public.companies
--    order by created_at desc limit 1;
--   -- esperado: ~14 dias
-- ============================================================================
