-- ============================================================================
-- 20260726_user_avatars.sql — Foto de perfil do usuário.
--
-- Contexto: os "ícones de perfil" do app (cabeçalho, ranking da equipe, ID
-- operacional) sempre foram a inicial do nome num círculo. Passam a mostrar a
-- foto que a própria pessoa envia.
--
-- Esta migration prepara o banco:
--   1. `users.avatar_url` — URL pública da foto (NULL = mostra a inicial).
--   2. GRANT da coluna nova para `authenticated`. Necessário porque os
--      privilégios de `users` foram espelhados COLUNA A COLUNA em
--      20260709_authenticated_role_grants.sql — coluna nova nasce sem grant e
--      o PostgREST devolveria 42501 no update.
--   3. Bucket `user-avatars` — leitura pública, escrita só do próprio dono
--      (ou de gerência/diretoria, que administram o cadastro).
--
-- `public_users()` NÃO muda de propósito: ela é chamada pelo anon para montar a
-- lista da tela de login. Expor foto de funcionário a quem só conhece a slug da
-- empresa é vazamento — a foto só aparece depois do login, via fetchUsers().
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente.
-- Pré-requisitos: 20260709_tenant_01/02/03, 20260709_authenticated_role_grants.
-- ============================================================================


-- ── (1) A coluna ────────────────────────────────────────────────────────────
alter table public.users add column if not exists avatar_url text;


-- ── (2) Grants da coluna nova ───────────────────────────────────────────────
-- Ver cabeçalho: sem isto, `update users set avatar_url` falha com
-- "permission denied for column avatar_url" mesmo com o RLS liberando a linha.
grant select (avatar_url), insert (avatar_url), update (avatar_url)
  on public.users to authenticated;

-- O anon continua sem NADA em users (20260711_tenant_03b_sweep.sql). A lista de
-- login vem do RPC public_users(), que não devolve avatar_url.


-- ── (3) Claims do token, para as policies do bucket ─────────────────────────
-- jwt_company_id() já existe (tenant_01). Faltavam estes dois: o token emitido
-- por /api/auth/session carrega `user_id` e `user_role` (ver lib/serverAuth.js).
create or replace function public.jwt_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_id', '')
$$;

create or replace function public.jwt_user_role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', '')
$$;


-- ── (4) Bucket das fotos ────────────────────────────────────────────────────
-- Path: `{company_id}/{user_id}/{timestamp}.jpg`.
--
-- Público na LEITURA, como `company-logos`: a foto aparece em listas inteiras
-- (ranking, equipe) e URL assinada por imagem exigiria uma chamada de rede por
-- linha renderizada. O que protege é o path — a pasta identifica empresa e
-- pessoa, mas o arquivo tem timestamp em milissegundos.
--
-- Na ESCRITA, mais fechado que o bucket de logos: além da empresa, confere a
-- PESSOA. Sem isso qualquer colaborador poderia trocar a foto de um colega.
-- Gerência e diretoria escapam da regra porque administram o cadastro.
insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists user_avatars_public_read on storage.objects;
create policy user_avatars_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'user-avatars');

drop policy if exists user_avatars_own_insert on storage.objects;
create policy user_avatars_own_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = public.jwt_company_id()
    and (
      (storage.foldername(name))[2] = public.jwt_user_id()
      or public.jwt_user_role() in ('gerencia', 'gestao')
    )
  );

drop policy if exists user_avatars_own_update on storage.objects;
create policy user_avatars_own_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = public.jwt_company_id()
    and (
      (storage.foldername(name))[2] = public.jwt_user_id()
      or public.jwt_user_role() in ('gerencia', 'gestao')
    )
  )
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = public.jwt_company_id()
    and (
      (storage.foldername(name))[2] = public.jwt_user_id()
      or public.jwt_user_role() in ('gerencia', 'gestao')
    )
  );

-- Trocar a foto grava um arquivo novo (timestamp) e o antigo fica órfão no
-- bucket. Apagar dá o direito de apagar — e o mesmo direito, com o path
-- montado errado, apaga a foto de outra pessoa. Órfão de ~20 KB é mais barato
-- que esse risco; se um dia incomodar, limpe por rotina no servidor.


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) A coluna existe e está liberada para authenticated:
--   select column_name from information_schema.columns
--    where table_name = 'users' and column_name = 'avatar_url';   -- 1 linha
--   select grantee, privilege_type from information_schema.column_privileges
--    where table_name = 'users' and column_name = 'avatar_url';
--   -- esperado: authenticated com SELECT/INSERT/UPDATE; anon em NENHUMA linha
--
-- (b) A lista de login continua sem foto:
--   select * from public.public_users('ibr') limit 1;
--   -- esperado: id, name, role, unit_id, sector_id — e nada de avatar_url
--
-- (c) O bucket existe e é público na leitura:
--   select id, public from storage.buckets where id = 'user-avatars';
--
-- (d) Escrita cross-tenant / cross-usuário é negada (rode como anon):
--   set role anon;
--   insert into storage.objects (bucket_id, name)
--     values ('user-avatars','ibr/u5/1.jpg');
--   -- esperado: violação de policy
--   reset role;
--
-- (e) Fim a fim: no app, cabeçalho → avatar → "Escolher foto". A foto deve
--     aparecer no cabeçalho, no Meu ID e no ranking da Equipe.
-- ============================================================================
