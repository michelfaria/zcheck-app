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
-- E um segundo caminho, que não passa pelo RLS: `create_user_from_request`
-- (20260726_tenant_03e) é SECURITY DEFINER, aceita GERÊNCIA, aceita pedido em
-- qualquer status e termina em `ON CONFLICT (id) DO UPDATE SET name, pin,
-- role, unit_id, sector_id`. Uma gerência com o id de qualquer pedido da
-- empresa (ela mesma insere um: `user_requests_tenant_rw` é FOR ALL para
-- authenticated) e o id da diretoria em `p_user_id` troca o PIN da diretoria e
-- a rebaixa — tomada de conta. O app nunca usa esse caminho: a fila de pedidos
-- só carrega para `gestao` e a aprovação manda sempre um id NOVO (`uid()`).
--
-- ── A correção ──────────────────────────────────────────────────────────────
--   · SELECT continua para todo membro autenticado da empresa — ranking, equipe
--     e Meu ID leem `users` (fetchUsers em lib/sync.js).
--   · INSERT/UPDATE/DELETE só com `jwt_user_role() = 'gestao'`, sempre dentro
--     da própria empresa. É o único papel que tem a aba Usuários.
--   · A exceção: cada pessoa troca a PRÓPRIA foto. Isso sai da tabela e vai
--     para a RPC `set_my_avatar(p_avatar_url)`, que só alcança a linha do
--     `user_id` do token, só toca `avatar_url` e `updated_at`, e só aceita
--     um arquivo da pasta da própria pessoa no bucket `user-avatars`.
--   · `create_user_from_request` passa a ser o que o app já usa: só a
--     diretoria, só CRIA (id que já existe é recusado, sem ON CONFLICT), só a
--     partir de pedido `pendente` — que ela marca `aprovado` na mesma
--     transação, então o mesmo pedido não cria duas pessoas.
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
--   · provision_company e /api/auth/refresh — `service_role`, que tem
--     BYPASSRLS.
--   · O gatilho de vagas `users_seat_quota` (20260923_limite_usuarios, já em
--     produção). Ele vale para a tabela e para as duas RPCs. Os comentários
--     de lá ainda citam `users_tenant_rw` como a policy que recusa escrita de
--     outra empresa e o ON CONFLICT da aprovação: depois desta migration, quem
--     recusa é `users_gestao_insert`/`users_gestao_update`, e a aprovação não
--     tem mais ON CONFLICT (o cuidado (b) do gatilho fica inofensivo).
--   · Os grants. A trava é o RLS; mexer em grant de `users` já custou um
--     .upsert() quebrado (ver o comentário de saveUsers em lib/sync.js).
--
-- ── Ordem de publicação ─────────────────────────────────────────────────────
--   1. Deploy do cliente que chama `set_my_avatar` (lib/sync.js,
--      saveUserAvatar). Enquanto a função não existe ele recebe PGRST202 e cai
--      no UPDATE direto de antes — nada quebra.
--   2. ESPERAR os aparelhos recarregarem — um dia inteiro de operação. Aba ou
--      PWA aberta desde antes do deploy roda o bundle VELHO (public/sw.js é
--      network-first, mas não força reload de quem está aberto), e o bundle
--      velho troca a foto por UPDATE direto: depois desta migration isso é
--      UPDATE de ZERO linhas, o PostgREST responde 204 sem erro, a tela diz
--      que salvou e a foto some no próximo reload. O cliente novo confere a
--      contagem e ERRA — o velho não tem como.
--   3. Esta migration. O `notify pgrst` do fim recarrega o cache de esquema
--      do PostgREST, para a RPC nova não responder PGRST202 logo depois.
-- A aprovação de cadastro não pede deploy: o app já chama a RPC como
-- diretoria, com id novo e pedido pendente.
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
--   node supabase/migrations/20260923_users_escrita_gestao.combinado.test.mjs
-- Pré-requisitos: 20260709_tenant_02_rls (RLS ligado em users),
--                 20260726_user_avatars (users.avatar_url, jwt_user_id,
--                 jwt_user_role), 20260726_tenant_03e (a versão anterior de
--                 create_user_from_request, mesma assinatura).
--
-- Se a trava do fim (5) encontrar outra policy de escrita em `users`, a
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
--
-- E o VALOR é conferido. Agora que esta é a única porta para `avatar_url`, "só
-- a foto muda" tem de valer também para o que entra nela: a foto de cada um
-- vai para o `<img src>` de todos os colegas (Equipe, ranking, Painel) e para
-- o cache de cada aparelho. Sem conferência, qualquer um gravava
--   · um endereço externo — um pixel que entrega IP e navegador de cada colega
--     que abre a Equipe;
--   · a URL da foto de um colega — para se passar por ele;
--   · uma string de megabytes — que fetchUsers manda para a empresa inteira a
--     cada carga.
-- Aceita só NULL (tira a foto) ou exatamente o que uploadUserAvatar
-- (lib/sync.js) produz: https, host do Supabase, bucket `user-avatars`, pasta
-- `{empresa do token}/{usuário do token}/` e um nome de arquivo simples.
-- O host fica preso a `*.supabase.co`: se o projeto passar a servir por
-- domínio próprio, acrescentar o domínio aqui (a foto nova falharia com erro,
-- não em silêncio).
create or replace function public.set_my_avatar(p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    text := public.jwt_user_id();
  v_company text := public.jwt_company_id();
  v_pasta   text;
  v_caminho text;
begin
  if v_user is null or v_company is null then
    raise exception 'sem sessão válida' using errcode = '42501';
  end if;

  if p_avatar_url is not null then
    -- O tamanho primeiro: não roda expressão regular sobre megabytes.
    if length(p_avatar_url) > 512 then
      raise exception 'foto recusada: endereço longo demais' using errcode = '22023';
    end if;

    v_pasta   := '/storage/v1/object/public/user-avatars/' || v_company || '/' || v_user || '/';
    v_caminho := substring(p_avatar_url from '^https://[A-Za-z0-9-]+\.supabase\.co(/.*)$');

    if v_caminho is null
       or left(v_caminho, length(v_pasta)) <> v_pasta
       or substr(v_caminho, length(v_pasta) + 1) !~ '^[A-Za-z0-9_-][A-Za-z0-9._-]*$' then
      raise exception 'foto recusada: tem de ser um arquivo da sua pasta (user-avatars/%/%/) no armazenamento do app',
        v_company, v_user using errcode = '22023';
    end if;
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


-- ── (4) Aprovação de cadastro: só a diretoria, e só CRIA ────────────────────
-- A função é SECURITY DEFINER — não passa pelo RLS de (2) —, então a regra
-- "só a diretoria escreve em users" tem de estar escrita AQUI dentro também.
-- Mesma assinatura e mesmo retorno de 20260726_tenant_03e: o cliente
-- (approveRequest em app/app/page.js) não muda. O que muda:
--   · só `gestao`. A gerência não tem a aba Usuários nem carrega a fila de
--     pedidos; aceitá-la aqui era a porta que sobrava.
--   · só CRIA. `p_user_id` que já existe é recusado — o ON CONFLICT DO UPDATE
--     de antes reescrevia nome, PIN, papel, loja e setor de QUALQUER pessoa da
--     empresa. O app manda sempre um id novo; editar gente é pela tabela, que
--     o RLS já prende à diretoria.
--   · só pedido `pendente`, e o pedido vira `aprovado` na MESMA transação: um
--     pedido velho não serve de chave para nada, e dois cliques (ou dois
--     aparelhos) não criam a mesma pessoa duas vezes — o segundo espera o
--     lock da linha e já a encontra aprovada. Se o INSERT falhar (ZC_QUOTA,
--     por exemplo), a marcação volta junto e o pedido continua na fila.
-- O app segue gravando `reviewed_at`/`reviewed_by` e os ajustes do pedido logo
-- depois, como antes; aqui só o `status`, que é o que trava a reaprovação.
create or replace function public.create_user_from_request(
  p_request_id text,
  p_user_id    text,
  p_name       text,
  p_role       text,
  p_unit_id    text,
  p_sector_id  text,
  p_pin        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin     text;
  v_role    text := public.jwt_user_role();
  v_company text := public.jwt_company_id();
begin
  if v_company is null then
    raise exception 'sem sessão válida' using errcode = '42501';
  end if;

  if v_role is distinct from 'gestao' then
    raise exception 'apenas a diretoria aprova cadastro' using errcode = '42501';
  end if;

  if nullif(p_user_id, '') is null then
    raise exception 'id do usuário novo ausente' using errcode = '22023';
  end if;

  -- Em QUALQUER empresa: id de outra empresa também não pode ser tocado, e a
  -- mensagem não diz de qual empresa ele é.
  if exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'usuário % já existe — a aprovação só cria acesso novo', p_user_id
      using errcode = '23505';
  end if;

  update public.user_requests
     set status = 'aprovado'
   where id::text = p_request_id
     and company_id = v_company
     and status = 'pendente'
  returning coalesce(nullif(p_pin, ''), pin) into v_pin;

  if not found then
    if exists (select 1 from public.user_requests
                where id::text = p_request_id and company_id = v_company) then
      raise exception 'solicitação % não está pendente — já foi aprovada ou recusada', p_request_id
        using errcode = '55000';
    end if;
    raise exception 'solicitação % não encontrada no escopo da sua empresa', p_request_id
      using errcode = 'P0002';
  end if;

  if v_pin is null then
    raise exception 'solicitação % sem PIN', p_request_id using errcode = '23502';
  end if;

  -- INSERT puro: duas aprovações correndo com o mesmo id novo terminam em
  -- chave duplicada, não em sobrescrita. (Não citar a cláusula de upsert
  -- neste corpo: a verificação (b) do fim procura por ela no texto da função.)
  insert into public.users (id, company_id, name, pin, role, unit_id, sector_id, suspended, updated_at)
  values (p_user_id, v_company, p_name, v_pin, p_role, p_unit_id, p_sector_id, false, now());
end;
$$;

-- `create or replace` mantém os grants, mas a migration não conta com isso.
revoke all on function public.create_user_from_request(text, text, text, text, text, text, text) from public;
revoke all on function public.create_user_from_request(text, text, text, text, text, text, text) from anon;
grant execute on function public.create_user_from_request(text, text, text, text, text, text, text) to authenticated;


-- ── (5) Trava: nada mais reabre a escrita ───────────────────────────────────
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


-- ── (6) O PostgREST enxerga a RPC nova já ───────────────────────────────────
-- Com o cache de esquema velho, `set_my_avatar` responde PGRST202 e o cliente
-- cai no UPDATE direto — que para quem não é diretoria agora é zero linhas.
-- O NOTIFY só sai no COMMIT: se a trava acima abortar, nada é recarregado.
notify pgrst, 'reload schema';


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
-- (b) As RPCs existem, o anon não executa, e a aprovação é a versão nova:
--
--   select has_function_privilege('anon', 'public.set_my_avatar(text)', 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', 'public.set_my_avatar(text)', 'EXECUTE') as autenticado,
--          has_function_privilege('anon',
--            'public.create_user_from_request(text,text,text,text,text,text,text)', 'EXECUTE') as anon_aprova,
--          pg_get_functiondef('public.create_user_from_request(text,text,text,text,text,text,text)'::regprocedure)
--            ilike '%on conflict%' as aprovacao_com_on_conflict;
--   -- esperado: false | true | false | false
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
--   select public.set_my_avatar('https://example.com/x.gif');    -- ERRO 22023
--   rollback;
--
-- (c2) A aprovação não aceita mais gerência (troque os ids por uma gerência
--      real e por qualquer pedido da empresa):
--
--   begin;
--   select set_config('request.jwt.claims',
--     '{"user_id":"<id>","user_role":"gerencia","company_id":"<empresa>"}', true);
--   set local role authenticated;
--   select public.create_user_from_request('<pedido>', '<id da diretoria>',
--     'x', 'gerencia', null, null, '0000');
--   -- esperado: ERRO 'apenas a diretoria aprova cadastro'
--   rollback;
--
-- (d) Fim a fim no app:
--   · colaborador → Meu ID → trocar a foto: aparece no cabeçalho e continua lá
--     depois do reload;
--   · diretoria → Usuários → editar, suspender, criar e apagar: igual a antes;
--   · diretoria → aprovar uma solicitação de cadastro: igual a antes, e ela
--     sai da fila.
-- ============================================================================
