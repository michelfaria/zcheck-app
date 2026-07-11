-- ============================================================================
-- TENANT 4/4 — Provisionamento de empresa, do lado do servidor.
--
-- Contexto: até a migration 03, `/onboarding` criava empresa, lojas, setores,
-- tipos e o usuário de gestão com a anon key, direto do navegador — qualquer um
-- com a chave do bundle podia criar uma empresa no banco. A 03 fecha isso.
--
-- Provisionar é operação de PLATAFORMA, não de tenant: acontece antes de existir
-- qualquer usuário daquela empresa, então não há token de onde tirar identidade.
-- Por isso vive num RPC `security definer` que só o `service_role` executa, e é
-- chamado pela rota /api/admin/provision (nunca pelo cliente).
--
-- Ganho colateral: os 5 inserts viram UMA transação. Antes, uma falha no meio
-- deixava uma empresa órfã, com lojas e sem setores.
--
-- Pré-requisitos: tenant_01 e tenant_02.
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
begin
  -- ── Validação. Cada erro vira 400 na rota, com a mensagem intacta. ─────────
  if v_company_id is null or v_company_name is null or v_slug is null then
    raise exception 'company.id, company.name e company.slug são obrigatórios';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'slug inválido: use apenas minúsculas, dígitos e hífen';
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

  -- ── Tudo ou nada: a função inteira roda numa transação. ───────────────────
  insert into public.companies (id, name, slug, primary_color, plan, active)
  values (
    v_company_id, v_company_name, v_slug,
    coalesce(nullif(p #>> '{company,primary_color}', ''), '#063C5C'),
    coalesce(nullif(p #>> '{company,plan}', ''), 'trial'),
    true
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

  -- O papel é forçado: esta rota só cria gestão, nunca outro papel.
  insert into public.users (id, company_id, name, pin, role, unit_id, sector_id, suspended)
  values (v_admin_id, v_company_id, v_admin_name, v_admin_pin, 'gestao', null, null, false);

  -- O PIN nunca sai daqui.
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

-- Só o service_role executa. O cliente (anon/authenticated) nunca deve chamar.
revoke all on function public.provision_company(jsonb) from public;
revoke all on function public.provision_company(jsonb) from anon, authenticated;
grant execute on function public.provision_company(jsonb) to service_role;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) anon e authenticated NÃO podem executar:
--
--   set role anon;
--   select public.provision_company('{}'::jsonb);   -- esperado: permission denied
--   reset role;
--
-- (b) Validação recusa payload incompleto (rode como postgres/service_role):
--
--   select public.provision_company('{"company":{"id":"x"}}'::jsonb);
--   -- esperado: erro "company.id, company.name e company.slug são obrigatórios"
--
-- (c) Atomicidade: um payload com slug duplicado não deve deixar resíduo.
--     Rode duas vezes o mesmo payload válido e confirme que a segunda falha e
--     que `select count(*) from units where company_id = '<id>'` não dobrou.
--
-- (d) Fim a fim, pela rota (fora do SQL editor):
--
--   curl -X POST https://<host>/api/admin/provision \
--        -H "x-provision-secret: $PROVISION_SECRET" \
--        -H 'Content-Type: application/json' \
--        -d '{"company":{"id":"acme","name":"Acme","slug":"acme"},
--             "units":[{"id":"acme1","name":"Loja Centro"}],
--             "admin":{"id":"acme-adm","name":"Fulano","pin":"1234"}}'
-- ============================================================================
