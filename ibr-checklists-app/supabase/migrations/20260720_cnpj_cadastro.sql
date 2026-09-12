-- ============================================================================
-- 20260720_cnpj_cadastro.sql — Cadastro completo de empresa + CNPJ como
-- identidade única + trava de trial por histórico de CNPJ.
--
-- POR QUE ASSIM:
--
-- 1. O cap antigo era "uma empresa por e-mail verificado" — trocar de e-mail
--    dava outro trial. A identidade real de uma empresa no Brasil é o CNPJ.
--
-- 2. A trava é pela RAIZ do CNPJ (8 primeiras posições = grupo econômico),
--    não pelo CNPJ completo: matriz e filiais compartilham a raiz (/0001,
--    /0002…). Travar pelo completo daria um trial por loja da mesma rede.
--
-- 3. `cnpj_trial_history` PRECISA sobreviver à deleção da empresa — senão
--    apagar o tenant reabriria o trial. Duas defesas:
--      a) a coluna se chama `origin_company_id`, NÃO `company_id` — a varredura
--         de `admin_delete_company` procura exatamente `company_id`;
--      b) a função ganha uma lista de exclusão explícita (abaixo).
--    Sem FK: a linha continua válida depois que a empresa deixa de existir.
--
-- 4. CNPJ alfanumérico (RFB, CNPJs emitidos a partir de 2026): as 12 primeiras
--    posições podem ter letras, os 2 DV continuam numéricos. `is_valid_cnpj`
--    usa ASCII−48, que vale para os dois formatos — não são dois caminhos.
--
-- ADITIVA: as colunas nascem NULL. Empresas existentes (ibr, kalit, demo)
-- seguem funcionando; a obrigatoriedade vale para cadastros NOVOS, na
-- aplicação. O backfill é manual, pelo /admin.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

-- ── (1) Validador de CNPJ no banco (última linha de defesa) ─────────────────
create or replace function public.is_valid_cnpj(p text)
returns boolean
language plpgsql
immutable
as $fn$
declare
  v    text := upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
  base text;
  s    int := 0;
  w    int;
  d1   int;
  d2   int;
  i    int;
begin
  if length(v) <> 14 then return false; end if;
  if v !~ '^[0-9A-Z]{12}[0-9]{2}$' then return false; end if;
  if v ~ '^(.)\1{13}$' then return false; end if;   -- 14 caracteres iguais

  -- DV1: pesos 2..9 cíclicos, da direita para a esquerda, sobre as 12 bases.
  base := substr(v, 1, 12);
  w := 2;
  for i in reverse 12..1 loop
    s := s + (ascii(substr(base, i, 1)) - 48) * w;
    w := case when w = 9 then 2 else w + 1 end;
  end loop;
  d1 := case when s % 11 < 2 then 0 else 11 - (s % 11) end;

  -- DV2: mesma regra sobre as 12 bases + DV1.
  base := base || d1::text;
  s := 0;
  w := 2;
  for i in reverse 13..1 loop
    s := s + (ascii(substr(base, i, 1)) - 48) * w;
    w := case when w = 9 then 2 else w + 1 end;
  end loop;
  d2 := case when s % 11 < 2 then 0 else 11 - (s % 11) end;

  return substr(v, 13, 2) = d1::text || d2::text;
end
$fn$;

-- Raiz do CNPJ (grupo econômico).
create or replace function public.cnpj_root(p text)
returns text
language sql
immutable
as $$
  select nullif(substr(upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')), 1, 8), '')
$$;


-- ── (2) Dados cadastrais da empresa ─────────────────────────────────────────
alter table public.companies add column if not exists cnpj            text;
alter table public.companies add column if not exists legal_name      text;  -- razão social
alter table public.companies add column if not exists contact_name    text;  -- responsável
alter table public.companies add column if not exists contact_role    text;  -- cargo (opcional)
alter table public.companies add column if not exists address_zip     text;
alter table public.companies add column if not exists address_city    text;
alter table public.companies add column if not exists address_state   text;  -- UF
-- contact_email e contact_whatsapp já existem (Fase 2.2 do Core).

-- CNPJ é identidade: um CNPJ, uma empresa. Índice parcial — os registros
-- legados sem CNPJ não colidem entre si.
create unique index if not exists companies_cnpj_key
  on public.companies (cnpj) where cnpj is not null;

-- Formato validado no banco (aceita NULL enquanto houver legado).
alter table public.companies drop constraint if exists companies_cnpj_valid;
alter table public.companies add constraint companies_cnpj_valid
  check (cnpj is null or public.is_valid_cnpj(cnpj));

-- ── (3) Cada loja/unidade vinculada a um CNPJ ───────────────────────────────
-- Matriz e filiais têm CNPJs distintos com a mesma raiz. Uma loja só costuma
-- repetir o CNPJ da própria empresa — por isso não há índice único aqui.
alter table public.units add column if not exists cnpj text;
alter table public.units drop constraint if exists units_cnpj_valid;
alter table public.units add constraint units_cnpj_valid
  check (cnpj is null or public.is_valid_cnpj(cnpj));

create index if not exists units_cnpj_idx on public.units (cnpj) where cnpj is not null;


-- ── (4) Histórico de trial por CNPJ (a trava anti-reuso) ────────────────────
-- ⚠️ `origin_company_id` NÃO se chama `company_id` de propósito: a varredura
-- de admin_delete_company procura exatamente esse nome. Esta tabela precisa
-- sobreviver à deleção da empresa, ou apagar o tenant reabriria o trial.
create table if not exists public.cnpj_trial_history (
  cnpj_root         text primary key,          -- grupo econômico
  cnpj              text not null,             -- CNPJ completo do primeiro uso
  origin_company_id text,                      -- sem FK, de propósito
  company_name      text,
  legal_name        text,
  contact_email     text,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  outcome           text                       -- converted | expired | deleted | null
);

create index if not exists cnpj_trial_history_started_idx
  on public.cnpj_trial_history (started_at desc);

alter table public.cnpj_trial_history enable row level security;
revoke all on public.cnpj_trial_history from anon, authenticated;

-- Backfill: as empresas que JÁ existem e têm CNPJ contam como trial usado.
insert into public.cnpj_trial_history
  (cnpj_root, cnpj, origin_company_id, company_name, legal_name, contact_email, started_at)
select public.cnpj_root(c.cnpj), c.cnpj, c.id, c.name, c.legal_name, c.contact_email,
       coalesce(c.created_at, now())
  from public.companies c
 where c.cnpj is not null
on conflict (cnpj_root) do nothing;


-- ── (5) provision_company v3: exige dados, valida CNPJ, aplica a trava ──────
-- Mantém tudo da v2 (slug reservado/curto, PIN, lojas opcionais) e acrescenta:
--   · company.cnpj obrigatório quando `require_cnpj` (padrão true);
--   · CNPJ válido e ainda não cadastrado;
--   · raiz que já usou trial é BLOQUEADA, salvo override explícito;
--   · grava os dados cadastrais e registra o histórico.
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


-- ── (6) admin_delete_company v3: NUNCA apaga o histórico de trial ───────────
-- Além do nome da coluna (origin_company_id), uma lista de exclusão explícita:
-- se um dia alguém renomear a coluna, a trava continua de pé.
create or replace function public.admin_delete_company(p_company_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  n bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_blocked boolean;
  v_pass int := 0;
  v_keep text[] := array['cnpj_trial_history'];  -- sobrevive à deleção
begin
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'empresa % não existe', p_company_id;
  end if;

  -- Marca o histórico como encerrado ANTES de apagar (a trava permanece).
  update public.cnpj_trial_history
     set ended_at = coalesce(ended_at, now()), outcome = 'deleted'
   where origin_company_id = p_company_id;

  loop
    v_pass := v_pass + 1;
    v_blocked := false;
    for r in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = 'public' and t.table_name = c.table_name
         and t.table_type = 'BASE TABLE'
       where c.table_schema = 'public'
         and c.column_name = 'company_id'
         and c.table_name <> 'companies'
         and not (c.table_name = any(v_keep))
    loop
      begin
        execute format('delete from public.%I where company_id = $1', r.table_name)
          using p_company_id;
        get diagnostics n = row_count;
        if n > 0 then
          v_deleted := jsonb_set(v_deleted, array[r.table_name],
            to_jsonb(coalesce((v_deleted ->> r.table_name)::bigint, 0) + n));
        end if;
      exception when foreign_key_violation then
        v_blocked := true;
      end;
    end loop;
    exit when not v_blocked or v_pass >= 6;
  end loop;

  if v_blocked then
    raise exception 'dependências de % não resolvidas em % passadas', p_company_id, v_pass;
  end if;

  delete from public.companies where id = p_company_id;
  return jsonb_build_object('passes', v_pass, 'deleted', v_deleted,
                            'trial_history', 'preservado');
end
$fn$;

revoke all on function public.admin_delete_company(text) from public;
revoke all on function public.admin_delete_company(text) from anon, authenticated;
grant execute on function public.admin_delete_company(text) to service_role;


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Validador (esperado: t, t, f, f):
--   select public.is_valid_cnpj('11.222.333/0001-81'),
--          public.is_valid_cnpj('12ABC34501DE35'),
--          public.is_valid_cnpj('11222333000182'),
--          public.is_valid_cnpj('00000000000000');
--
-- (b) Colunas criadas:
--   select column_name from information_schema.columns
--    where table_name = 'companies'
--      and column_name in ('cnpj','legal_name','contact_name','address_city');
--
-- (c) Histórico vazio (nenhuma empresa tem CNPJ ainda) e bloqueado p/ anon:
--   select count(*) from public.cnpj_trial_history;
--   set role anon; select * from public.cnpj_trial_history; reset role;
--
-- (d) TESTE DA TRAVA (empresa sintética — apaga tudo no fim):
--   select public.provision_company('{"company":{"id":"zz-cnpj-a","name":"ZZ A",
--     "slug":"zz-cnpj-a","cnpj":"11222333000181","legal_name":"ZZ A LTDA",
--     "contact_name":"Teste","contact_email":"t@t.com"},
--     "admin":{"id":"zz-cnpj-adm","name":"T","pin":"1234"}}'::jsonb);
--   -- 2ª tentativa com a MESMA raiz (filial /0002-62) deve FALHAR:
--   select public.provision_company('{"company":{"id":"zz-cnpj-b","name":"ZZ B",
--     "slug":"zz-cnpj-b","cnpj":"11222333000262","legal_name":"ZZ B LTDA",
--     "contact_name":"Teste","contact_email":"t@t.com"},
--     "admin":{"id":"zz-cnpj-adm2","name":"T","pin":"1234"}}'::jsonb);
--   -- esperado: "este CNPJ já utilizou o período de teste"
--   -- Deletar a empresa NÃO deve liberar o trial:
--   select public.admin_delete_company('zz-cnpj-a');
--   select cnpj_root, outcome from public.cnpj_trial_history;  -- 1 linha, 'deleted'
--   -- limpeza do teste:
--   delete from public.cnpj_trial_history where cnpj_root = '11222333';
-- ============================================================================
