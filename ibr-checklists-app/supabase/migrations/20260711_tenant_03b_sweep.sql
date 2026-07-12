-- ============================================================================
-- TENANT 3b — varredura do que a tenant_03 não alcançou.
--
-- Diagnóstico de 11/07/2026, em produção, após a tenant_03:
--   1. Políticas antigas criadas para o papel `public` (ex.: "read access for
--      all users", do esquema original) continuavam valendo para o anon —
--      a tenant_03 só derrubou as políticas nomeadas `_anon_legacy`.
--   2. Grants POR COLUNA em `users` e `user_requests` (criados pelas migrations
--      de PIN de 09/07) sobreviveram: no Postgres, `revoke ... on table` não
--      remove privilégios de coluna. Resultado: cpf, selfie_path, email e
--      phone de user_requests ainda legíveis pela anon key.
--
-- Este script é DINÂMICO: varre pg_policies e information_schema em vez de
-- confiar em lista fixa. Idempotente.
-- ============================================================================

-- ── 1. Derruba TODA política de anon/public nas tabelas operacionais ─────────
-- (as políticas `_tenant_rw` de `authenticated` ficam intactas)
do $$
declare p record;
begin
  for p in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('templates','users','completions','photos','closures',
                         'live_tasks','recognitions','push_subscriptions','user_requests')
       and ('anon' = any(roles) or 'public' = any(roles))
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    raise notice 'derrubada: % em %', p.policyname, p.tablename;
  end loop;
end $$;

-- ── 2. Garante RLS ligado em todas (cinto e suspensório) ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['templates','users','completions','photos','closures',
                           'live_tasks','recognitions','push_subscriptions','user_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── 3. Revoga os grants POR COLUNA que sobreviveram ──────────────────────────
-- users: anon não precisa de NADA (a lista de login vem do RPC public_users).
do $$
declare c record;
begin
  for c in
    select distinct table_name, column_name
      from information_schema.column_privileges
     where table_schema = 'public' and grantee = 'anon' and table_name = 'users'
  loop
    execute format('revoke all (%I) on public.users from anon', c.column_name);
  end loop;
end $$;

-- user_requests: o /cadastro precisa INSERIR como anon; leitura e update, não.
-- (o status é consultado pelo RPC user_request_status; a aprovação é autenticada)
do $$
declare c record;
begin
  for c in
    select distinct column_name
      from information_schema.column_privileges
     where table_schema = 'public' and grantee = 'anon'
       and table_name = 'user_requests'
       and privilege_type in ('SELECT','UPDATE','REFERENCES')
  loop
    execute format('revoke select, update, references (%I) on public.user_requests from anon', c.column_name);
  end loop;
end $$;

-- O insert do /cadastro continua precisando passar pelo RLS: recria a política
-- de insert para anon caso o passo 1 a tenha derrubado junto.
drop policy if exists user_requests_anon_insert on public.user_requests;
create policy user_requests_anon_insert on public.user_requests
  for insert to anon
  with check (true);

-- E garante o grant de INSERT em nível de tabela (o de coluna pode ter caído).
grant insert on public.user_requests to anon;

-- events: o insert anônimo é intencional (instrumentação pré-login). Se o
-- passo 1 não tocou (events fora da lista), nada muda. Confirma a política:
-- (a policy de insert de events veio da 0001 e é para anon+authenticated)

-- ── VERIFICAÇÃO EMBUTIDA — o resultado exibido deve ser TRÊS ZEROS ───────────
select 'políticas anon/public restantes' as item,
       count(*) as total
  from pg_policies
 where schemaname = 'public'
   and tablename in ('templates','users','completions','photos','closures',
                     'live_tasks','recognitions','push_subscriptions','user_requests')
   and ('anon' = any(roles) or 'public' = any(roles))
   and policyname <> 'user_requests_anon_insert'
union all
select 'colunas de users legíveis por anon',
       count(*)
  from information_schema.column_privileges
 where table_schema = 'public' and grantee = 'anon'
   and table_name = 'users' and privilege_type = 'SELECT'
union all
select 'colunas de user_requests legíveis por anon',
       count(*)
  from information_schema.column_privileges
 where table_schema = 'public' and grantee = 'anon'
   and table_name = 'user_requests' and privilege_type = 'SELECT';
