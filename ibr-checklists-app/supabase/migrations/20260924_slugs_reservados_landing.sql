-- ============================================================================
-- 20260924_slugs_reservados_landing.sql — Reserva os endereços de exemplo que
-- a landing mostra: suaempresa, sua-empresa, exemplo, demo.
--
-- POR QUE: a landing (app/page.js, URL_APP) desenha `suaempresa.zcheckapp.com/app`
-- na moldura de navegador/notebook em volta das capturas reais do app, e as
-- capturas (scripts/landing-shots/fixtures.js) usam a empresa de slug `exemplo`.
-- Nenhum dos dois era reservado: uma empresa de verdade chamada "SuaEmpresa"
-- ganharia exatamente o endereço impresso no site, e quem digitasse o endereço
-- da landing cairia no tenant dela.
--
-- A normalização do nome (`slug()` em app/comecar/page.js e app/onboarding/page.js)
-- troca espaço por hífen: "Sua Empresa" vira `sua-empresa`, NÃO `suaempresa`
-- ("SuaEmpresa" e "Suaempresa" é que viram `suaempresa`). Por isso as duas
-- grafias entram. `demo` entra por ser o nome óbvio de uma conta de demonstração.
--
-- A lista mora SÓ aqui, no banco: lib/tenant.js não tem lista de reservados
-- (resolve o subdomínio direto para o slug) e o /comecar não pré-confere —
-- o provision_company recusa e a mensagem volta pela /api/signup/provision.
--
-- O QUE MUDA: só o array `v_reserved`. Todas as 34 entradas anteriores
-- continuam; o resto da função é a v3 de 20260720_cnpj_cadastro, byte a byte
-- (o teste ao lado compara o corpo com e sem o array).
--
-- ATENÇÃO ao nome dos arquivos: 20260720_cnpj_cadastro entrou no repositório em
-- 12/09/2026 (7455192), DEPOIS de 20260721_trial_14_dias (21/07). A data do nome
-- engana: a v3 (CNPJ obrigatório + trava de trial por raiz) é a viva. Redefinir a
-- partir da 20260721 desligaria a trava de CNPJ. A guarda abaixo recusa rodar se
-- a função em produção não for a v3.
--
-- Reservar não despeja ninguém: empresa que já tenha um desses slugs segue
-- funcionando (a checagem só roda no cadastro). O resultado lista quem já usa.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- Pré-requisito: 20260720_cnpj_cadastro (provision_company v3).
-- Teste: 20260924_slugs_reservados_landing.test.mjs (PGlite).
-- ============================================================================

-- ── Guarda: a função viva tem de ser a v3 ───────────────────────────────────
-- O SQL Editor roda o script inteiro numa transação implícita: a exceção aqui
-- impede o `create or replace` abaixo.
do $guarda$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'provision_company'
       and p.prosrc like '%cnpj_trial_history%'
  ) then
    raise exception 'provision_company em produção não é a v3 (20260720_cnpj_cadastro): confira com pg_get_functiondef antes de rodar esta migration';
  end if;
end
$guarda$;


-- ── provision_company v4 = v3 + slugs de exemplo reservados ─────────────────
create or replace function public.provision_company(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company_id   text := nullif(trim(p #>> '{company,id}'), '');
  v_company_name text := nullif(trim(p #>> '{company,name}'), '');
  v_slug         text := nullif(trim(p #>> '{company,slug}'), '');
  v_cnpj         text := upper(regexp_replace(coalesce(p #>> '{company,cnpj}', ''), '[^0-9A-Za-z]', '', 'g'));
  v_legal_name   text := nullif(trim(p #>> '{company,legal_name}'), '');
  v_contact_name text := nullif(trim(p #>> '{company,contact_name}'), '');
  v_contact_role text := nullif(trim(p #>> '{company,contact_role}'), '');
  v_email        text := nullif(trim(p #>> '{company,contact_email}'), '');
  v_whatsapp     text := nullif(regexp_replace(coalesce(p #>> '{company,contact_whatsapp}', ''), '\D', '', 'g'), '');
  v_zip          text := nullif(regexp_replace(coalesce(p #>> '{company,address_zip}', ''), '\D', '', 'g'), '');
  v_city         text := nullif(trim(p #>> '{company,address_city}'), '');
  v_state        text := upper(nullif(trim(p #>> '{company,address_state}'), ''));
  v_admin_id     text := nullif(trim(p #>> '{admin,id}'), '');
  v_admin_name   text := nullif(trim(p #>> '{admin,name}'), '');
  v_admin_pin    text := p #>> '{admin,pin}';
  v_require_cnpj boolean := coalesce((p #>> '{options,require_cnpj}')::boolean, true);
  v_allow_reuse  boolean := coalesce((p #>> '{options,allow_trial_reuse}')::boolean, false);
  v_root         text;
  v_prev         record;
  v_units        int;
  v_sectors      int;
  v_types        int;
  v_reserved     text[] := array[
    'www','app','api','admin','entrar','lista','comecar','onboarding','cadastro',
    'importar','privacidade','signup','signin','login','logout','conta','account',
    'billing','dashboard','settings','ajuda','suporte','support','help','mail',
    'email','static','assets','cdn','status','blog','docs','zcheck','ingo',
    -- endereços de exemplo da landing e das capturas (20260924)
    'suaempresa','sua-empresa','exemplo','demo'
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

  -- ── Identificação da empresa ──────────────────────────────────────────────
  if v_require_cnpj then
    if v_cnpj = '' then
      raise exception 'CNPJ é obrigatório para cadastrar a empresa';
    end if;
    if v_legal_name is null then
      raise exception 'razão social é obrigatória';
    end if;
    if v_contact_name is null or v_email is null then
      raise exception 'nome e e-mail do responsável são obrigatórios';
    end if;
  end if;

  if v_cnpj <> '' then
    if not public.is_valid_cnpj(v_cnpj) then
      raise exception 'CNPJ inválido: confira os dígitos';
    end if;
    if exists (select 1 from public.companies where cnpj = v_cnpj) then
      raise exception 'este CNPJ já está cadastrado no ZCheck';
    end if;

    -- Trava de trial pela RAIZ (grupo econômico).
    v_root := public.cnpj_root(v_cnpj);
    select * into v_prev from public.cnpj_trial_history where cnpj_root = v_root;
    if found and not v_allow_reuse then
      raise exception 'este CNPJ já utilizou o período de teste (em %). Fale com o time comercial para reativar.',
        to_char(v_prev.started_at, 'DD/MM/YYYY');
    end if;
  end if;

  if exists (select 1 from public.companies where id = v_company_id or slug = v_slug) then
    raise exception 'empresa já existe (id ou slug em uso)';
  end if;
  if exists (select 1 from public.users where id = v_admin_id) then
    raise exception 'admin.id já existe';
  end if;

  insert into public.companies
    (id, name, slug, primary_color, plan, active, subscription_status, trial_ends_at,
     cnpj, legal_name, contact_name, contact_role, contact_email, contact_whatsapp,
     address_zip, address_city, address_state)
  values (
    v_company_id, v_company_name, v_slug,
    coalesce(nullif(p #>> '{company,primary_color}', ''), '#063C5C'),
    coalesce(nullif(p #>> '{company,plan}', ''), 'trial'),
    true,
    'trialing',
    now() + interval '14 days',
    nullif(v_cnpj, ''), v_legal_name, v_contact_name, v_contact_role, v_email, v_whatsapp,
    v_zip, v_city, v_state
  );

  -- Lojas/setores/tipos seguem opcionais (nascem no onboarding guiado).
  -- Cada unidade pode trazer o próprio CNPJ (matriz/filial).
  insert into public.units (id, company_id, name, color, active, sort_order, cnpj)
  select u.id, v_company_id, u.name,
         coalesce(nullif(u.color, ''), '#063C5C'), true, coalesce(u.sort_order, 0),
         nullif(upper(regexp_replace(coalesce(u.cnpj, ''), '[^0-9A-Za-z]', '', 'g')), '')
    from jsonb_to_recordset(coalesce(p -> 'units', '[]'::jsonb))
      as u(id text, name text, color text, sort_order int, cnpj text)
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

  -- Registra o consumo do trial. `do update` mantém a data ORIGINAL do
  -- primeiro uso (o override do admin não zera o histórico).
  if v_cnpj <> '' then
    insert into public.cnpj_trial_history
      (cnpj_root, cnpj, origin_company_id, company_name, legal_name, contact_email)
    values (v_root, v_cnpj, v_company_id, v_company_name, v_legal_name, v_email)
    on conflict (cnpj_root) do update
      set origin_company_id = excluded.origin_company_id,
          company_name      = excluded.company_name,
          ended_at          = null,
          outcome           = null;
  end if;

  return jsonb_build_object(
    'company_id', v_company_id,
    'slug',       v_slug,
    'cnpj',       nullif(v_cnpj, ''),
    'units',      v_units,
    'sectors',    v_sectors,
    'types',      v_types,
    'admin_id',   v_admin_id
  );
end;
$fn$;

revoke all on function public.provision_company(jsonb) from public;
revoke all on function public.provision_company(jsonb) from anon, authenticated;
grant execute on function public.provision_company(jsonb) to service_role;


-- ── Resultado ───────────────────────────────────────────────────────────────
-- O SQL Editor descarta `raise notice`; o diagnóstico volta como linha.
-- `empresa_que_ja_usa` nulo = endereço livre, agora reservado. Preenchido =
-- uma empresa já tinha o slug antes da reserva (segue funcionando).
select r.slug,
       co.id as empresa_que_ja_usa
  from unnest(array['suaempresa','sua-empresa','exemplo','demo']) as r(slug)
  left join public.companies co on co.slug = r.slug
 order by r.slug;

-- ============================================================================
-- VERIFICAÇÃO
--   select pg_get_functiondef('public.provision_company(jsonb)'::regprocedure)
--          like '%''suaempresa'',''sua-empresa'',''exemplo'',''demo''%' as reservou,
--          pg_get_functiondef('public.provision_company(jsonb)'::regprocedure)
--          like '%cnpj_trial_history%' as ainda_v3;
--   -- esperado: true, true
-- ============================================================================
