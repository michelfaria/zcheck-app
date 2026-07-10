-- ============================================================================
-- TENANT 3/3 — Corta o acesso anônimo aos dados operacionais.
--
-- ⚠️  ESTA É A ÚNICA MIGRATION DESTA SÉRIE QUE PODE QUEBRAR O APP.
--
-- NÃO rodar antes de, nesta ordem:
--   1. tenant_01 + authenticated_role_grants + tenant_02 aplicadas;
--   2. SUPABASE_JWT_SECRET configurado no Vercel (Production e Preview);
--   3. deploy do app feito;
--   4. login real verificado: entrar com PIN, ver os checklists, concluir um
--      item, abrir Relatórios, e — se for gestão — abrir a tela de aprovação de
--      cadastros. Se qualquer um falhar, o token não está funcionando. Conserte
--      antes de rodar isto.
--
-- Depois desta migration, quem tem só a anon key não lê mais nada operacional.
-- É o que fecha o vazamento entre tenants.
--
-- ROLLBACK de emergência no rodapé.
-- ============================================================================

-- ── Remove as políticas temporárias criadas em tenant_02 ─────────────────────
-- e revoga os privilégios de `anon` nas tabelas operacionais. Grants são
-- avaliados ANTES do RLS: sem grant, nem chega a testar política.
do $$
declare t text;
begin
  foreach t in array array[
    'templates', 'users', 'completions', 'photos', 'closures',
    'live_tasks', 'recognitions', 'push_subscriptions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_legacy', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Políticas permissivas herdadas das migrations antigas, que davam a `anon`
-- acesso irrestrito. `live_tasks` era a pior: `for all using(true) with
-- check(true)` deixava qualquer um marcar ou reabrir tarefa de qualquer loja.
drop policy if exists recognitions_select on public.recognitions;
drop policy if exists recognitions_insert on public.recognitions;
drop policy if exists live_tasks_all     on public.live_tasks;
drop policy if exists live_tasks_client  on public.live_tasks;

-- `events` continua aceitando insert anônimo: a instrumentação roda antes do
-- login (o próprio evento `login` é emitido sem token). Leitura, nunca.
revoke select on public.events from anon;

-- `user_requests`: o /cadastro precisa continuar INSERINDO como anônimo (o
-- colaborador ainda não tem conta), mas anon nunca deveria ter podido LER.
-- Verificado em 09/07/2026: com a anon key do bundle era possível listar nome,
-- CPF e selfie_path de todos os cadastros pendentes. Só o `pin` estava coberto.
revoke select on public.user_requests from anon;

-- ── Metadados de tenant: anon passa a só LER ─────────────────────────────────
-- São lidos antes do login para montar a tela de entrada, e expõem apenas nomes
-- de empresa, loja, setor e turno. A lista de pessoas já saiu daqui — virou o
-- RPC public_users(), escopado por empresa.
--
-- ⚠️ ESCRITA ANÔNIMA FECHA AQUI. Hoje `/onboarding` cria empresa, lojas, setores
-- e usuários, e `/importar` insere templates — tudo com a anon key, sem login.
-- Qualquer um com a chave do bundle podia criar uma empresa no seu banco.
-- Depois desta migration essas duas páginas param de funcionar até ganharem
-- autenticação de gestão. É intencional.
do $$
declare t text;
begin
  foreach t in array array['units', 'sectors', 'checklist_types', 'companies']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_legacy', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_read', t);
    execute format('create policy %I on public.%I for select to anon using (true)',
                   t || '_anon_read', t);
    execute format('revoke insert, update, delete on public.%I from anon', t);
  end loop;
end $$;

-- ============================================================================
-- VERIFICAÇÃO — a prova de que o vazamento fechou.
--
-- (a) Com a anon key, tudo abaixo deve responder 401 / 42501:
--
--   for T in templates users completions recognitions live_tasks photos \
--            closures push_subscriptions user_requests; do
--     curl -s "https://rjuulamozdhssgqrzfji.supabase.co/rest/v1/$T?select=id&limit=1" \
--          -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
--   done
--   -- esperado em todas: {"code":"42501", ... "permission denied for table ..."}
--
-- (b) A tela de login continua montando:
--
--   curl -s '.../rest/v1/units?select=id,name&limit=1' -H "apikey: <ANON_KEY>" ...
--   -- esperado: 200
--
--   curl -s -X POST '.../rest/v1/rpc/public_users' -H "apikey: <ANON_KEY>" \
--        -H "Authorization: Bearer <ANON_KEY>" \
--        -H 'Content-Type: application/json' -d '{"p_company_id":"ibr"}'
--   -- esperado: 200 com a lista de nomes
--
-- (c) O /cadastro continua conseguindo inserir (insert anônimo preservado).
--
-- (d) Com um token real de /api/auth/session, a leitura funciona e vem escopada:
--
--   curl -s '.../rest/v1/completions?select=id,company_id&limit=5' \
--        -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <TOKEN>"
--   -- esperado: 200, e todo company_id igual ao do token.
-- ============================================================================

-- ============================================================================
-- ROLLBACK DE EMERGÊNCIA — cole no SQL Editor se o app quebrar.
-- Devolve o acesso anônimo, ou seja, devolve o vazamento. É saída de incêndio,
-- não um estado aceitável: corrija o token e rode a 03 de novo.
--
--   do $$
--   declare t text;
--   begin
--     foreach t in array array['templates','users','completions','photos',
--                              'closures','live_tasks','recognitions',
--                              'push_subscriptions']
--     loop
--       execute format('grant select, insert, update, delete on public.%I to anon', t);
--       execute format('drop policy if exists %I on public.%I', t || '_anon_legacy', t);
--       execute format('create policy %I on public.%I for all to anon using (true) with check (true)',
--                      t || '_anon_legacy', t);
--     end loop;
--     -- O PIN nunca volta a ser legível:
--     revoke select (pin) on public.users from anon;
--   end $$;
--
--   grant select on public.user_requests to anon;   -- reexpõe CPF: só se preciso
--   revoke select (pin) on public.user_requests from anon;
-- ============================================================================
