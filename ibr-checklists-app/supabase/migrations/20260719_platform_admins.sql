-- ============================================================================
-- 20260719_platform_admins.sql — Etapa 1.2 do ZCheck Core (auth do /admin).
--
-- Quem pode entrar no /admin: usuários do Supabase Auth (email+senha) que
-- TAMBÉM estejam nesta tabela. A senha é validada pelo GoTrue; esta tabela é
-- só a lista de membros da plataforma — dois portões independentes.
--
-- A tabela não tem NENHUMA policy de propósito: com RLS ligado e zero
-- policies, anon/authenticated não leem nem escrevem nada. Só a service_role
-- (usada por /api/admin/login, server-only) enxerga a lista.
--
-- ⚠️ PASSO MANUAL ANTES DESTE SCRIPT: crie o usuário no painel do Supabase
--    (Authentication → Users → Add user), com email defaria.mrf@gmail.com e
--    uma senha forte, marcando "Auto Confirm User". O insert abaixo puxa o id
--    desse usuário pelo e-mail — se o usuário não existir, insere 0 linhas.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- O schema public concede privilégios por default a anon/authenticated no
-- Supabase; revogamos explicitamente — cinto e suspensório além do RLS.
revoke all on public.platform_admins from anon, authenticated;

-- Michel como super-admin (depende do usuário criado no painel — ver acima).
insert into public.platform_admins (user_id, email)
select id, email
  from auth.users
 where email = 'defaria.mrf@gmail.com'
on conflict (user_id) do nothing;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) O admin entrou na lista (1 linha):
--   select email, created_at from public.platform_admins;
--   -- Se vier vazio: o usuário de Auth ainda não existia quando o insert
--   -- rodou. Crie-o no painel e rode SÓ o insert de novo.
--
-- (b) anon não enxerga nada:
--   set role anon;
--   select * from public.platform_admins;  -- esperado: permission denied
--   reset role;
-- ============================================================================
