-- ============================================================================
-- 20260715_signups.sql — Cadastro self-service de empresas.
--
-- Contexto: até aqui, criar empresa exigia o PROVISION_SECRET (só a equipe tem),
-- via /onboarding → /api/admin/provision → provision_company. Este arquivo abre
-- o caminho PÚBLICO: /comecar → /api/signup/* → provision_company.
--
-- A porta pública é protegida por e-mail OTP (Brevo) + Turnstile + rate-limit.
-- Todo o estado do cadastro em andamento vive na tabela `signups`, tocada só
-- pela service_role (nas rotas /api/signup/*). O anon/authenticated NUNCA a lê
-- nem escreve — mesmo padrão de `login_attempts` e `waitlist`.
--
-- Parte 2 reaplica `provision_company` acrescentando guarda de slug reservado e
-- comprimento mínimo — defesa em profundidade, já que agora o slug pode vir de
-- um usuário anônimo (o subdomínio da empresa = slug).
--
-- Rode este arquivo inteiro no Supabase SQL Editor (projeto rjuulamozdhssgqrzfji).
-- É idempotente — pode rodar mais de uma vez.
-- ============================================================================


-- ── (1) Tabela de cadastros em andamento ────────────────────────────────────
create table if not exists public.signups (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null,
  code_hash              text not null,             -- HMAC-SHA256 do OTP (nunca em claro)
  claim_hash             text,                      -- HMAC-SHA256 do claim_token (setado no verify)
  attempts               integer not null default 0,
  verified_at            timestamptz,
  provisioned_company_id text,
  ip                     text,
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null       -- validade do OTP (now()+10min)
);

-- Índices para os rate-limits e para achar o cadastro mais recente por e-mail.
create index if not exists signups_email_created_idx on public.signups (email, created_at desc);
create index if not exists signups_ip_created_idx    on public.signups (ip, created_at desc);

-- RLS ligado e sem políticas: nega tudo para anon/authenticated. A service_role
-- ignora RLS por definição, então as rotas /api/signup/* continuam funcionando.
alter table public.signups enable row level security;

-- Cinto e suspensório: além do RLS, remove qualquer grant de tabela. O anon não
-- deve sequer ter privilégio de SELECT/INSERT aqui.
revoke all on public.signups from anon, authenticated;


-- ── (2) provision_company — reaplicado com guarda de slug reservado/curto ────
-- Idêntico à 20260709_tenant_04_provision.sql, com dois `raise exception` novos.
-- Slugs reservados nunca podem virar subdomínio de tenant; slug < 3 chars vira
-- squatting barato. Vale tanto para /comecar quanto para /onboarding.
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
  -- Subdomínios que o produto usa/reserva — não podem virar slug de empresa.
  v_reserved     text[] := array[
    'www','app','api','admin','entrar','lista','comecar','onboarding','cadastro',
    'importar','privacidade','signup','signin','login','logout','conta','account',
    'billing','dashboard','settings','ajuda','suporte','support','help','mail',
    'email','static','assets','cdn','status','blog','docs','zcheck','ingo'
  ];
begin
  -- ── Validação. Cada erro vira 400 na rota, com a mensagem intacta. ─────────
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
-- (a) anon NÃO toca em signups:
--
--   set role anon;
--   select * from public.signups limit 1;          -- esperado: permission denied
--   insert into public.signups (email, code_hash, expires_at)
--     values ('x@y.z', 'h', now());                 -- esperado: permission denied
--   reset role;
--
-- (b) slug reservado / curto é recusado (rode como postgres/service_role):
--
--   select public.provision_company(
--     '{"company":{"id":"app","name":"X","slug":"app"},
--       "units":[{"id":"u","name":"L"}],
--       "admin":{"id":"a","name":"N","pin":"1234"}}'::jsonb);
--   -- esperado: erro "slug reservado: escolha outro nome de empresa"
--
--   select public.provision_company(
--     '{"company":{"id":"ab","name":"X","slug":"ab"},
--       "units":[{"id":"u","name":"L"}],
--       "admin":{"id":"a","name":"N","pin":"1234"}}'::jsonb);
--   -- esperado: erro "slug muito curto: mínimo de 3 caracteres"
--
-- (c) empresa nova continua sendo criada (slug válido, não reservado, >= 3):
--     confirme companies/units/sectors/checklist_types/users populados e some
--     tudo com um rollback se estiver testando à mão.
-- ============================================================================
