-- ============================================================================
-- TENANT 2/3 — Liga o RLS e cria as políticas por company_id.
--
-- ADITIVA POR CONSTRUÇÃO: para cada tabela operacional criamos DUAS políticas —
-- a definitiva (`authenticated`, escopada por company_id) e uma temporária
-- (`anon`, permissiva) que preserva exatamente o comportamento atual. Sem a
-- temporária, `enable row level security` negaria tudo para o anon e derrubaria
-- o app que está em produção agora. A migration 03 remove as temporárias.
--
-- Pré-requisitos: tenant_01 e authenticated_role_grants, nessa ordem.
-- ============================================================================

-- public.jwt_company_id() é criada em tenant_01 (os DEFAULTs dependem dela).

-- ── Grupo A: dados operacionais ──────────────────────────────────────────────
-- Depois da migration 03, o anon não enxerga nada aqui.
do $$
declare t text;
begin
  foreach t in array array[
    'templates', 'users', 'completions', 'photos', 'closures',
    'live_tasks', 'recognitions', 'push_subscriptions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_tenant_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using      (company_id = public.jwt_company_id())
        with check (company_id = public.jwt_company_id())
    $f$, t || '_tenant_rw', t);

    -- TEMPORÁRIA — removida pela migration 03. Mantém o app de pé no intervalo
    -- entre esta migration e o deploy do cliente autenticado.
    execute format('drop policy if exists %I on public.%I', t || '_anon_legacy', t);
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      t || '_anon_legacy', t);
  end loop;
end $$;

-- ── Grupo B: metadados de tenant ─────────────────────────────────────────────
-- Lidos ANTES do login, a partir do subdomínio, para montar a tela de entrada.
-- O anon mantém SELECT aqui de forma permanente. O que fica exposto são nomes de
-- empresa, loja, setor e turno — não dado operacional. Escopar isso exigiria
-- identidade antes do login, que por definição não existe.
do $$
declare t text;
begin
  foreach t in array array['units', 'sectors', 'checklist_types']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_tenant_rw', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using      (company_id = public.jwt_company_id())
        with check (company_id = public.jwt_company_id())
    $f$, t || '_tenant_rw', t);

    -- TEMPORÁRIA e permissiva (não só select): /onboarding e /importar ainda
    -- inserem nestas tabelas como anônimos. A migration 03 troca isto por uma
    -- política de leitura apenas.
    execute format('drop policy if exists %I on public.%I', t || '_anon_legacy', t);
    execute format('create policy %I on public.%I for all to anon using (true) with check (true)',
                   t || '_anon_legacy', t);
  end loop;
end $$;

-- `companies` é a raiz do tenant: escopa por id, não por company_id.
alter table public.companies enable row level security;
drop policy if exists companies_tenant_rw on public.companies;
create policy companies_tenant_rw on public.companies
  for all to authenticated
  using      (id = public.jwt_company_id())
  with check (id = public.jwt_company_id());

drop policy if exists companies_anon_legacy on public.companies;
create policy companies_anon_legacy on public.companies
  for all to anon using (true) with check (true);

-- ── user_requests ────────────────────────────────────────────────────────────
-- Já tem RLS e políticas próprias (20260709_secure_user_requests.sql). O /cadastro
-- insere como anon e precisa continuar podendo. Só acrescentamos o lado
-- autenticado, escopado. A leitura anônima é cortada por GRANT na migration 03.
alter table public.user_requests enable row level security;
drop policy if exists user_requests_tenant_rw on public.user_requests;
create policy user_requests_tenant_rw on public.user_requests
  for all to authenticated
  using      (company_id = public.jwt_company_id())
  with check (company_id = public.jwt_company_id());

-- ── events ───────────────────────────────────────────────────────────────────
-- Append-only. A policy de insert para anon/authenticated já existe (0001).
-- Leitura só do próprio tenant, e só autenticado.
drop policy if exists events_tenant_select on public.events;
create policy events_tenant_select on public.events
  for select to authenticated
  using (company_id = public.jwt_company_id());

-- ── Lista de usuários da tela de login ───────────────────────────────────────
-- Pré-login não há token, logo o RLS não sabe o tenant. Em vez de deixar `users`
-- legível por anon (o que vaza nome e cargo de todas as empresas), expomos um
-- RPC `security definer` que devolve só as colunas da tela de login, de UMA
-- empresa. Inclui suspensos — o login precisa distinguir "PIN errado" de
-- "acesso suspenso". O PIN nunca é projetado.
create or replace function public.public_users(p_company_id text)
returns table (id text, name text, role text, unit_id text, sector_id text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.name, u.role, u.unit_id, u.sector_id
    from public.users u
   where u.company_id = p_company_id
   order by u.name
$$;

revoke all on function public.public_users(text) from public;
grant execute on function public.public_users(text) to anon, authenticated;

-- ── Status da solicitação de cadastro ────────────────────────────────────────
-- A tela "verificar status" do /cadastro é usada por quem ainda não tem conta,
-- então precisa funcionar sem token. Antes ela lia `user_requests` direto pela
-- chave anônima — que é justamente a leitura que a migration 03 revoga, porque
-- expunha nome, CPF e selfie_path de todos os cadastros pendentes.
--
-- Este RPC exige o CPF completo e devolve só o status. Aceita os dois formatos
-- de armazenamento (com e sem pontuação).
create or replace function public.user_request_status(p_cpf text)
returns table (status text)
language sql
security definer
set search_path = public
as $$
  select r.status
    from public.user_requests r
   where regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g') = regexp_replace(p_cpf, '\D', '', 'g')
     and length(regexp_replace(p_cpf, '\D', '', 'g')) = 11
   order by r.created_at desc
   limit 1
$$;

revoke all on function public.user_request_status(text) from public;
grant execute on function public.user_request_status(text) to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO — o app deve continuar funcionando EXATAMENTE como antes.
--
-- (a) O helper devolve NULL sem token (é o que faz a política negar):
--
--   select public.jwt_company_id();   -- esperado: NULL
--
-- (b) O RPC devolve a lista de login de um tenant só:
--
--   select count(*) from public.public_users('ibr');              -- > 0
--   select count(*) from public.public_users('__inexistente__');  -- 0
--
-- (b2) O RPC de status aceita CPF com e sem pontuação, e exige 11 dígitos:
--
--   select * from public.user_request_status('12345678909');
--   select * from public.user_request_status('123.456.789-09');  -- mesmo resultado
--   select count(*) from public.user_request_status('123');      -- 0 (curto demais)
--
-- (c) Do terminal, com a anon key, as leituras AINDA funcionam (política
--     temporária). Se alguma destas falhar agora, algo saiu errado — corrija
--     antes de fazer o deploy:
--
--   curl -s '.../rest/v1/templates?select=id&limit=1'   -H "apikey: <ANON>" ...
--   curl -s '.../rest/v1/completions?select=id&limit=1' -H "apikey: <ANON>" ...
--
-- (d) Cada tabela do Grupo A deve ter 2 políticas; as do Grupo B, 2 também:
--
--   select tablename, policyname, roles from pg_policies
--    where schemaname = 'public' order by tablename, policyname;
--
-- SÓ DEPOIS DISTO: deploy do app, verificar login real, e então a migration 03.
-- ============================================================================
