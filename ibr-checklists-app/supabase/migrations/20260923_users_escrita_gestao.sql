-- ============================================================================
-- 20260923_users_escrita_gestao.sql — só a diretoria escreve em `public.users`.
--
-- ── O que estava aberto ─────────────────────────────────────────────────────
-- A policy `users_tenant_rw` (20260709_tenant_02_rls.sql) é
--
--     for all to authenticated
--       using      (company_id = public.jwt_company_id())
--       with check (company_id = public.jwt_company_id())
--
-- — escopo de EMPRESA, sem nenhuma condição de PAPEL. E o `authenticated` tem
-- INSERT/UPDATE/DELETE de tabela em `users`: 20260709_authenticated_role_grants
-- copiou os do anon, e 20260709_secure_pin_validation só revogou o SELECT.
-- 20260716_billing deixa `users` fora do WITH CHECK de propósito, então nem o
-- billing restringe.
--
-- O token de sessão (/api/auth/session) é emitido para QUALQUER papel. Com ele,
-- um colaborador comum, direto no PostgREST:
--
--     PATCH /rest/v1/users?id=eq.<o próprio id>   {"role":"gestao"}
--
-- vira diretoria no próximo login. Pelo mesmo caminho: tira a suspensão de
-- alguém, muda a loja (`unit_id`) de qualquer colega, troca o PIN de qualquer
-- colega (UPDATE de `pin` é permitido — só a LEITURA foi fechada), cria usuário
-- novo ou apaga usuário da empresa. A aba Usuários só aparece para `gestao`
-- (ROLE_TABS em app/app/page.js), mas aba escondida não é fronteira de acesso.
--
-- ── A correção ──────────────────────────────────────────────────────────────
--   · SELECT continua para todo membro autenticado da empresa — ranking, equipe
--     e Meu ID leem `users` (fetchUsers em lib/sync.js).
--   · INSERT/UPDATE/DELETE só com `jwt_user_role() = 'gestao'`, sempre dentro
--     da própria empresa. É o único papel que tem a aba Usuários.
--   · A exceção: cada pessoa troca a PRÓPRIA foto. Isso sai da tabela e vai
--     para a RPC `set_my_avatar(p_avatar_url)`, que só alcança a linha do
--     `user_id` do token e só toca `avatar_url` e `updated_at`.
--
-- Por que RPC e não grant por coluna: grant é por PAPEL DO POSTGRES, não por
-- linha, e toda sessão do app é o mesmo papel `authenticated`. Um
-- `grant update (avatar_url)` sozinho não diz "só na linha dele"; somado a uma
-- policy de UPDATE "na própria linha", a pessoa editaria TODAS as colunas da
-- própria linha — `role` inclusive, que é exatamente o buraco. Separar exigiria
-- um gatilho comparando OLD e NEW, que é segurança espalhada em dois lugares.
-- Com a RPC, a regra da tabela fica uma só e legível no pg_policies:
-- "escreve quem é gestao".
--
-- ── O que NÃO muda ──────────────────────────────────────────────────────────
--   · create_user_from_request — SECURITY DEFINER: roda como dona da tabela, e
--     a dona não passa pelo RLS. Continua aceitando gerência e diretoria, com
--     as checagens que já tem (20260726_tenant_03e).
--   · provision_company e /api/auth/refresh — `service_role`, que tem
--     BYPASSRLS.
--   · Os grants. A trava é o RLS; mexer em grant de `users` já custou um
--     .upsert() quebrado (ver o comentário de saveUsers em lib/sync.js).
--
-- ── Ordem de publicação ─────────────────────────────────────────────────────
--   1. Deploy do cliente que chama `set_my_avatar` (lib/sync.js,
--      saveUserAvatar). Enquanto a função não existe ele recebe PGRST202 e cai
--      no UPDATE direto de antes — nada quebra.
--   2. Esta migration.
-- Na ordem inversa, até o deploy sair, a troca de foto de quem não é diretoria
-- vira UPDATE de ZERO linhas: o PostgREST responde 204, sem erro, e a foto
-- some no próximo reload.
--
-- ── Risco que continua, e não é desta migration ─────────────────────────────
-- O papel vem do CLAIM do token, que vale 7 dias (lib/serverAuth.js). Uma
-- diretoria rebaixada ou suspensa segue com poder de escrita até o token
-- vencer ou até /api/auth/refresh recusar a renovação. É o mesmo modelo de
-- create_user_from_request e de todas as policies por `jwt_user_role()`.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Testada em PGlite:
--   node supabase/migrations/20260923_users_escrita_gestao.test.mjs
-- Pré-requisitos: 20260709_tenant_02_rls (RLS ligado em users),
--                 20260726_user_avatars (users.avatar_url, jwt_user_id,
--                 jwt_user_role).
--
-- Se a trava do fim (4) encontrar outra policy de escrita em `users`, a
-- migration INTEIRA é desfeita e a mensagem de erro diz qual policy é: vários
-- comandos enviados numa consulta só rodam numa transação implícita (é o que o
-- teste prova no PGlite). Se a trava disparar no SQL Editor, confira com (a)
-- que `users_tenant_rw` continua lá antes de rodar de novo.
-- ============================================================================


-- ── (1) Sai a policy "tudo para qualquer papel" ─────────────────────────────
drop policy if exists users_tenant_rw on public.users;

-- A temporária do anon deveria ter morrido em 20260709_tenant_03. Se sobrou,
-- é `for all to anon using (true)`: inerte só enquanto o anon não tiver grant.
drop policy if exists users_anon_legacy on public.users;


-- ── (2) Leitura: a empresa inteira. Escrita: só a diretoria ─────────────────
-- `jwt_user_role()` lê o claim `user_role` do token (20260726_user_avatars).
-- Sem token ele é NULL, e `NULL = 'gestao'` nega.
drop policy if exists users_tenant_select on public.users;
create policy users_tenant_select on public.users
  for select to authenticated
  using (company_id = public.jwt_company_id());

drop policy if exists users_gestao_insert on public.users;
create policy users_gestao_insert on public.users
  for insert to authenticated
  with check (company_id = public.jwt_company_id()
              and public.jwt_user_role() = 'gestao');

-- O WITH CHECK repete o USING: sem ele, a diretoria poderia mandar um usuário
-- para outra empresa trocando `company_id`.
drop policy if exists users_gestao_update on public.users;
create policy users_gestao_update on public.users
  for update to authenticated
  using      (company_id = public.jwt_company_id()
              and public.jwt_user_role() = 'gestao')
  with check (company_id = public.jwt_company_id()
              and public.jwt_user_role() = 'gestao');

drop policy if exists users_gestao_delete on public.users;
create policy users_gestao_delete on public.users
  for delete to authenticated
  using (company_id = public.jwt_company_id()
         and public.jwt_user_role() = 'gestao');


-- ── (3) A própria foto, por RPC ─────────────────────────────────────────────
-- A linha é a do `user_id` do TOKEN — não há parâmetro de usuário para ninguém
-- apontar para a linha de um colega. `company_id` confere de novo porque a
-- função é SECURITY DEFINER e o RLS não vale aqui dentro.
--
-- Sem linha atualizada, ERRO: um "ok" calado faria o modal dizer que salvou.
create or replace function public.set_my_avatar(p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    text := public.jwt_user_id();
  v_company text := public.jwt_company_id();
begin
  if v_user is null or v_company is null then
    raise exception 'sem sessão válida' using errcode = '42501';
  end if;

  update public.users
     set avatar_url = p_avatar_url,
         updated_at = now()
   where id = v_user
     and company_id = v_company;

  if not found then
    raise exception 'usuário % não encontrado na sua empresa', v_user using errcode = 'P0002';
  end if;
end;
$$;

-- Função nova em `public` nasce executável pelo anon (default privileges do
-- Supabase — ver 20260726_tenant_03e). Sem token a função já recusa, mas o
-- anon não tem o que fazer aqui.
revoke all on function public.set_my_avatar(text) from public;
revoke all on function public.set_my_avatar(text) from anon;
grant execute on function public.set_my_avatar(text) to authenticated;


-- ── (4) Trava: nada mais reabre a escrita ───────────────────────────────────
-- Policies PERMISSIVE se somam com OR. Qualquer outra policy de escrita para
-- um papel de cliente — criada à mão no dashboard, ou vinda de migration que
-- não está no repositório — anularia tudo acima em silêncio. Então a migration
-- confere o estado final e, se sobrar alguma, aborta e diz qual.
do $$
declare
  v_rls   boolean;
  v_sobra text;
begin
  select c.relrowsecurity into v_rls
    from pg_class c
   where c.oid = 'public.users'::regclass;

  if not v_rls then
    raise exception 'RLS está DESLIGADO em public.users — nenhuma policy vale. Nada foi aplicado.';
  end if;

  select string_agg(format('%s (%s para %s)', p.policyname, p.cmd,
                           array_to_string(p.roles, ',')), '; ' order by p.policyname)
    into v_sobra
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename  = 'users'
     and p.permissive = 'PERMISSIVE'
     and p.cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
     and p.roles && array['anon', 'authenticated', 'public']::name[]
     and p.policyname not in ('users_gestao_insert', 'users_gestao_update',
                              'users_gestao_delete');

  if v_sobra is not null then
    raise exception 'public.users tem outra policy de escrita, que reabriria o buraco: %. Nada foi aplicado — revise, remova e rode de novo.', v_sobra;
  end if;
end $$;


-- ============================================================================
-- VERIFICAÇÃO
--
-- (0) ANTES de aplicar — o estado que esta migration pressupõe. Uma linha só,
--     para caber na grade do SQL Editor:
--
--   select
--     (select relrowsecurity from pg_class where oid = 'public.users'::regclass) as rls_ligado,
--     (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' | ' order by policyname)
--        from pg_policies where schemaname = 'public' and tablename = 'users') as policies,
--     has_table_privilege('authenticated', 'public.users', 'UPDATE') as auth_update,
--     has_table_privilege('authenticated', 'public.users', 'INSERT') as auth_insert,
--     has_table_privilege('authenticated', 'public.users', 'DELETE') as auth_delete,
--     has_any_column_privilege('anon', 'public.users', 'UPDATE')     as anon_update;
--   -- esperado hoje: true | users_tenant_rw:ALL:authenticated | true | true | true | false
--   -- Se `policies` trouxer QUALQUER outra coisa, leia antes de rodar.
--   -- (`information_schema` omite grant a PUBLIC — por isso has_*_privilege.)
--
-- (a) DEPOIS — as quatro policies, e mais nenhuma:
--
--   select policyname, cmd, roles, qual, with_check
--     from pg_policies where schemaname = 'public' and tablename = 'users'
--    order by policyname;
--   -- users_gestao_delete | DELETE · users_gestao_insert | INSERT ·
--   -- users_gestao_update | UPDATE · users_tenant_select | SELECT
--
-- (b) A RPC existe e o anon não executa:
--
--   select has_function_privilege('anon', 'public.set_my_avatar(text)', 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', 'public.set_my_avatar(text)', 'EXECUTE') as autenticado;
--   -- esperado: false | true
--
-- (c) Simulando um COLABORADOR no próprio SQL Editor (troque os ids por um
--     colaborador real; tudo dentro de uma transação desfeita no fim):
--
--   begin;
--   select set_config('request.jwt.claims',
--     '{"user_id":"<id>","user_role":"colaborador","company_id":"<empresa>"}', true);
--   set local role authenticated;
--   update public.users set role = 'gestao' where id = '<id>';   -- UPDATE 0
--   select public.set_my_avatar(null);                           -- ok
--   rollback;
--
-- (d) Fim a fim no app:
--   · colaborador → Meu ID → trocar a foto: aparece no cabeçalho e continua lá
--     depois do reload;
--   · diretoria → Usuários → editar, suspender, criar e apagar: igual a antes;
--   · diretoria → aprovar uma solicitação de cadastro: igual a antes.
-- ============================================================================
