-- ============================================================================
-- 20260924_user_requests_gestao.sql — a fila de pedidos de acesso é da diretoria.
--
-- ── O que estava aberto ─────────────────────────────────────────────────────
-- `public.user_requests` guarda os pedidos do /cadastro — nome, CPF, telefone,
-- e-mail, PIN em texto e o caminho da selfie — e os "[ALTERAÇÃO DE DADOS]" que
-- qualquer pessoa manda pelo Meu ID. Duas policies decidiam quem mexe:
--
--   · user_requests_tenant_rw (20260709_tenant_02_rls)
--       for all to authenticated
--         using      (company_id = public.jwt_company_id())
--         with check (company_id = public.jwt_company_id())
--
--     Escopo de EMPRESA, nenhum de PAPEL — e o token de sessão
--     (/api/auth/session) sai para qualquer papel. Um colaborador, direto no
--     PostgREST:
--       GET    /rest/v1/user_requests?select=name,cpf,phone,email
--              lê CPF, telefone e e-mail de todo mundo que já pediu acesso;
--       PATCH  /rest/v1/user_requests?id=eq.<pedido>  {"cpf":…,"email":…}
--              troca os dados de um pedido pendente antes da aprovação;
--       PATCH  …  {"status":"rejeitado"}
--              tira o pedido da fila (ela só carrega `pendente`) sem ninguém
--              ter recusado;
--       DELETE /rest/v1/user_requests?status=eq.pendente
--              esvazia a fila.
--     A fila, a aprovação e a recusa só aparecem para `gestao` (app/app/page.js:
--     o efeito "Load pending requests", approveRequest, rejectRequest e o aviso
--     de pendentes no login), mas tela escondida não é fronteira de acesso.
--
--   · user_requests_anon_insert (20260711_tenant_03b_sweep)
--       for insert to anon with check (true)
--
--     A anon key é pública (bundle, lib/supabase.js, repositório público).
--     Qualquer um grava pedido para QUALQUER company_id: empresa desativada,
--     empresa que não existe, ou nenhuma (company_id nulo e sem loja — linha que
--     nenhuma diretoria vê e ninguém apaga). E já com `status` e `reviewed_*`
--     preenchidos: um "aprovado por <id da diretoria>" que ninguém aprovou.
--
-- ── A correção ──────────────────────────────────────────────────────────────
--   · SELECT, UPDATE e DELETE só com `jwt_user_role() = 'gestao'`, na própria
--     empresa. É o único papel que carrega a fila, aprova e recusa. O UPDATE
--     repete a condição no WITH CHECK: sem ele, a diretoria mandaria um pedido
--     para outra empresa trocando `company_id`.
--   · INSERT autenticado: qualquer papel, só na própria empresa — é o
--     "Solicitar alteração de dados" do Meu ID. E o pedido nasce como o app o
--     grava: `pendente`, sem `reviewed_*` e sem selfie. A alteração não tem
--     selfie; selfie é do /cadastro, e a 20260924_colaboradores_selfie_diretoria
--     decide de quem é uma selfie pelo PRIMEIRO pedido que cita o objeto. Um
--     pedido autenticado não precisa entrar nessa disputa.
--   · INSERT anônimo (/cadastro): continua, só para empresa que EXISTE e está
--     ATIVA (`companies.active`), e também nasce `pendente` e sem revisão.
--     "Ativa" é o mesmo filtro que o /cadastro usa para achar a empresa
--     (`.eq('active', true)`): o banco passa a concordar com a tela. Teste
--     vencido e assinatura cancelada NÃO entram — a tela não os considera, e
--     bloquear cadastro de quem está em atraso é decisão de cobrança, não de
--     acesso a dado.
--   · `company_id` ganha DEFAULT `jwt_company_id()`, como as outras tabelas do
--     tenant em 20260709_tenant_01. O pedido de alteração do Meu ID não manda
--     `company_id` (app/app/page.js, handleSubmit do modal): até hoje ele saía
--     da loja, pelo gatilho `user_requests_company`. Diretoria e gerência de
--     várias lojas não têm UMA loja (`unit_id` nulo, ou "u1,u2"), o gatilho não
--     acha empresa, o WITH CHECK recusa — e o app não confere o `error` do
--     insert, então a tela dizia "enviado" e nada era gravado. Com o DEFAULT o
--     pedido nasce na empresa do token. Para o anon o DEFAULT é NULL (a anon
--     key não tem `company_id`) e o gatilho segue derivando da loja, como antes.
--
-- Por que o "empresa ativa" é uma função SECURITY DEFINER, e não um
-- `exists (select … from companies)` escrito na policy: a expressão da policy
-- roda com o papel de quem insere. Escrita direto, ela dependeria de o anon
-- LER `companies` — `companies_anon_read` (20260726_tenant_03c, `using (true)`)
-- e o grant da coluna `active`. Fechar essa leitura é o próximo aperto óbvio,
-- e quem o fizer quebraria o /cadastro sem saber. A função lê como dona.
-- O custo: o anon precisa de EXECUTE (chamada de função em policy confere o
-- EXECUTE de quem consulta), e o PostgREST a expõe em
-- /rpc/user_requests_empresa_ativa. Ela responde "o id X existe e está ativo?"
-- — o mesmo que `GET /rest/v1/companies?id=eq.X&active=eq.true` já responde ao
-- anon hoje. Nada novo sai.
--
-- A trava é o RLS; os grants ficam como estão (mesmo motivo de
-- 20260923_users_escrita_gestao). O `pin` continua fora do SELECT por coluna
-- (20260709_secure_user_requests), inclusive para a diretoria.
--
-- ── O que NÃO muda ──────────────────────────────────────────────────────────
--   · O gatilho `user_requests_selfie_trava` (20260924_colaboradores_selfie_
--     diretoria): esta migration não toca gatilho nenhum. Os dois rodam em
--     qualquer ordem (o teste prova, quando os dois arquivos estão lado a lado).
--     O comentário de lá — "user_requests é gravável por qualquer um" — fica
--     mais estreito do que diz: depois desta, o UPDATE é só da diretoria da
--     própria empresa e o pedido autenticado não traz selfie. O anon continua
--     inserindo selfie_path, então a regra do primeiro pedido segue necessária.
--   · O gatilho `user_requests_company` (20260709_tenant_01).
--   · As funções SECURITY DEFINER que leem a tabela não passam pelo RLS e não
--     mudam: create_user_from_request (aprovação), user_request_status (tela
--     "verificar status" do /cadastro), colaboradores_selfie_* (selfie).
--   · service_role (BYPASSRLS).
--
-- ── Nenhum deploy antes ─────────────────────────────────────────────────────
-- O app já faz exatamente o que as policies novas pedem:
--   · a fila, o aviso de pendentes, a aprovação e a recusa rodam só para
--     `gestao`, com o token (authedSupabase);
--   · os dois INSERTs — /cadastro (anon) e alteração (token) — são
--     `.insert({...})` SEM `.select()`. O PostgREST roda isso como
--     `INSERT … RETURNING 1`, que não pede SELECT; o Postgres só confere as
--     policies de SELECT numa escrita quando o RETURNING cita coluna. É por
--     isso que o colaborador segue pedindo alteração sem enxergar a tabela
--     (o teste prova as duas formas). NÃO acrescentar `.select()` a esses
--     inserts: para quem não é diretoria viraria erro de RLS;
--   · bundle velho: /cadastro antigo derivava a empresa da loja — o gatilho
--     segue fazendo isso, e a checagem de empresa ativa vale depois dele.
-- Independe de 20260923_users_escrita_gestao e da 20260924_colaboradores_
-- selfie_diretoria: roda antes, depois ou entre elas.
--
-- ── Risco que continua, e não é desta migration ─────────────────────────────
--   · Spam na fila de uma empresa ATIVA: o /cadastro é público por definição.
--     O Turnstile é opcional no cliente ("if Turnstile fails to load, allow
--     submission") e não é conferido no servidor para este insert. Fechar isso
--     pede mover o insert para uma rota de API com captcha e limite por IP.
--   · A função `notify-request` manda e-mail à diretoria para qualquer
--     `companyId` que o anon postar — independe desta tabela.
--   · `user_request_status(p_cpf)` diz ao anon se um CPF pediu acesso e o
--     status do pedido.
--   · Até a 20260923_users_escrita_gestao entrar, a `create_user_from_request`
--     de produção (20260726_tenant_03e) aceita GERÊNCIA e termina em ON
--     CONFLICT DO UPDATE. A gerência continua podendo INSERIR um pedido (é a
--     alteração de dados) com um `id` escolhido por ela e passá-lo à RPC. Esta
--     migration não fecha isso — a escrita_gestao fecha.
--   · O papel vem do claim do token, que vale 7 dias (lib/serverAuth.js).
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Mandar o arquivo INTEIRO numa execução só: vários comandos numa
-- consulta rodam numa transação implícita, e as travas (5) e (6) DESFAZEM
-- TUDO se sobrar outra policy em `user_requests` ou se a simulação mostrar um
-- papel abaixo da diretoria lendo pedido. A mensagem de erro diz o que foi.
-- Teste: node supabase/migrations/20260924_user_requests_gestao.test.mjs
-- Pré-requisitos: 20260709_tenant_01 (company_id, jwt_company_id, gatilho
--                 user_requests_company), 20260726_user_avatars
--                 (jwt_user_role), 20260711_tenant_03b (user_requests_anon_insert).
-- ============================================================================


-- ── (0) Travas de entrada ───────────────────────────────────────────────────
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'user_requests'
         and column_name in ('company_id', 'status', 'selfie_path', 'reviewed_at', 'reviewed_by')) <> 5 then
    raise exception 'public.user_requests sem company_id/status/selfie_path/reviewed_at/reviewed_by. Nada foi aplicado.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'companies'
                    and column_name = 'active' and data_type = 'boolean') then
    raise exception 'public.companies.active não existe ou não é boolean — a checagem de empresa ativa não teria o que ler. Nada foi aplicado.';
  end if;
end $$;

alter table public.user_requests enable row level security;


-- ── (1) Sai a policy "tudo para qualquer papel" ─────────────────────────────
drop policy if exists user_requests_tenant_rw on public.user_requests;


-- ── (2) Leitura e escrita da fila: só a diretoria ───────────────────────────
-- `jwt_user_role()` lê o claim `user_role` do token (20260726_user_avatars).
-- Sem token ele é NULL, e `NULL = 'gestao'` nega.
drop policy if exists user_requests_gestao_select on public.user_requests;
create policy user_requests_gestao_select on public.user_requests
  for select to authenticated
  using (company_id = public.jwt_company_id()
         and public.jwt_user_role() = 'gestao');

drop policy if exists user_requests_gestao_update on public.user_requests;
create policy user_requests_gestao_update on public.user_requests
  for update to authenticated
  using      (company_id = public.jwt_company_id()
              and public.jwt_user_role() = 'gestao')
  with check (company_id = public.jwt_company_id()
              and public.jwt_user_role() = 'gestao');

drop policy if exists user_requests_gestao_delete on public.user_requests;
create policy user_requests_gestao_delete on public.user_requests
  for delete to authenticated
  using (company_id = public.jwt_company_id()
         and public.jwt_user_role() = 'gestao');


-- ── (3) Pedido de alteração: qualquer papel, na própria empresa ─────────────
-- O WITH CHECK vale DEPOIS dos gatilhos BEFORE: o `company_id` conferido já é
-- o do DEFAULT (ou o derivado da loja).
alter table public.user_requests alter column company_id set default public.jwt_company_id();

drop policy if exists user_requests_membro_insert on public.user_requests;
create policy user_requests_membro_insert on public.user_requests
  for insert to authenticated
  with check (company_id = public.jwt_company_id()
              and status = 'pendente'
              and reviewed_at is null
              and reviewed_by is null
              and selfie_path is null);


-- ── (4) /cadastro: anônimo, só para empresa que existe e está ativa ─────────
-- search_path vazio e tudo qualificado. NULL (pedido sem empresa e sem loja)
-- responde false.
create or replace function public.user_requests_empresa_ativa(p_company_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.companies c
                  where c.id = p_company_id and c.active is true)
$$;

-- Função nova em `public` nasce executável por PUBLIC (Postgres) e por
-- anon/authenticated (default privileges do Supabase). Só o anon precisa: é a
-- única policy que a chama.
revoke all on function public.user_requests_empresa_ativa(text) from public, anon, authenticated;
grant execute on function public.user_requests_empresa_ativa(text) to anon;

-- Mesmo nome de 20260711_tenant_03b: as verificações de 03b/03c/03d o citam.
drop policy if exists user_requests_anon_insert on public.user_requests;
create policy user_requests_anon_insert on public.user_requests
  for insert to anon
  with check (status = 'pendente'
              and reviewed_at is null
              and reviewed_by is null
              and public.user_requests_empresa_ativa(company_id));


-- ── (5) Trava: nenhuma outra policy reabre a tabela ─────────────────────────
-- Policies PERMISSIVE se somam com OR. Qualquer outra policy de leitura ou
-- escrita para um papel de cliente — criada à mão no dashboard ("Enable read
-- access for all users"), ou vinda de migration que não está no repositório —
-- anularia tudo acima em silêncio. Então a migration confere o estado final e,
-- se sobrar alguma, aborta e diz qual.
do $$
declare
  v_sobra text;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.user_requests'::regclass) then
    raise exception 'RLS está DESLIGADO em public.user_requests — nenhuma policy vale. Nada foi aplicado.';
  end if;

  select string_agg(format('%s (%s para %s)', p.policyname, p.cmd,
                           array_to_string(p.roles, ',')), '; ' order by p.policyname)
    into v_sobra
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename  = 'user_requests'
     and p.permissive = 'PERMISSIVE'
     and p.roles && array['anon', 'authenticated', 'public']::name[]
     and p.policyname not in ('user_requests_gestao_select', 'user_requests_gestao_update',
                              'user_requests_gestao_delete', 'user_requests_membro_insert',
                              'user_requests_anon_insert');

  if v_sobra is not null then
    raise exception 'public.user_requests tem outra policy, que reabriria a fila: %. Nada foi aplicado — revise, remova e rode de novo.', v_sobra;
  end if;
end $$;


-- ── (6) Trava: o próprio banco responde quem lê a fila ──────────────────────
-- Com o papel e o token que o PostgREST usaria, na empresa com MAIS pedidos:
-- colaborador, liderança e gerência têm de ver ZERO; a diretoria, todos os
-- dessa empresa. E uma diretoria de empresa que não existe, zero. Só leitura —
-- escrita não se simula em produção. Vazamento DESFAZ A MIGRATION INTEIRA; a
-- diretoria vendo menos que o esperado não aborta (não é vazamento), mas a
-- linha 6 da SIMULAÇÃO mostra — e aí a fila de aprovação ficou incompleta.
drop table if exists _ur_sim;
create temp table _ur_sim (ord int, item text, valor text, esperado text);

do $$
declare
  v_claims  text := current_setting('request.jwt.claims', true);
  v_empresa text;
  n_empresa bigint;
  n_sonda   bigint;
  n_colab   bigint;
  n_lid     bigint;
  n_ger     bigint;
  n_dir     bigint;
  v_n       bigint;
  v_papel   text;
  v_simulou boolean := true;
begin
  select r.company_id, count(*) into v_empresa, n_empresa
    from public.user_requests r
   where r.company_id is not null
   group by r.company_id
   order by count(*) desc, r.company_id
   limit 1;

  begin
    perform set_config('request.jwt.claims', json_build_object(
      'role', 'authenticated', 'company_id', '__sonda_sem_empresa__',
      'user_id', '__sonda__', 'user_role', 'gestao')::text, true);
    set local role authenticated;
    select count(*) into n_sonda from public.user_requests;
    reset role;

    if v_empresa is not null then
      foreach v_papel in array array['colaborador', 'lideranca', 'gerencia', 'gestao'] loop
        perform set_config('request.jwt.claims', json_build_object(
          'role', 'authenticated', 'company_id', v_empresa,
          'user_id', '__sonda__', 'user_role', v_papel)::text, true);
        set local role authenticated;
        select count(*) into v_n from public.user_requests;
        reset role;
        case v_papel
          when 'colaborador' then n_colab := v_n;
          when 'lideranca'   then n_lid   := v_n;
          when 'gerencia'    then n_ger   := v_n;
          else                    n_dir   := v_n;
        end case;
      end loop;
    end if;
  exception when insufficient_privilege then
    -- O `postgres` do SQL Editor não conseguiu assumir `authenticated`, ou o
    -- `authenticated` não tem SELECT em coluna nenhuma da tabela.
    v_simulou := false;
  end;
  perform set_config('request.jwt.claims', coalesce(v_claims, '{}'), true);

  insert into _ur_sim values
    (1, 'simulação rodou (postgres assumiu authenticated)', v_simulou::text, 'true'),
    (2, 'diretoria de empresa inexistente vê pedidos', coalesce(n_sonda::text, '—'), '0'),
    (3, 'COLABORADOR da empresa com mais pedidos vê pedidos', coalesce(n_colab::text, '—'), '0'),
    (4, 'LIDERANÇA dessa empresa vê pedidos', coalesce(n_lid::text, '—'), '0'),
    (5, 'GERÊNCIA dessa empresa vê pedidos', coalesce(n_ger::text, '—'), '0'),
    (6, 'DIRETORIA dessa empresa vê os pedidos dela (todos)',
        coalesce(n_dir::text, '—'), coalesce(n_empresa::text, '— (nenhum pedido com empresa)'));

  if coalesce(n_sonda, 0) > 0 or coalesce(n_colab, 0) > 0
     or coalesce(n_lid, 0) > 0 or coalesce(n_ger, 0) > 0 then
    raise exception 'Pedido de cadastro ainda legível fora da diretoria (sem empresa %, colaborador %, liderança %, gerência %). NADA foi aplicado.',
      coalesce(n_sonda, 0), coalesce(n_colab, 0), coalesce(n_lid, 0), coalesce(n_ger, 0);
  end if;
end $$;


-- ============================================================================
-- VERIFICAÇÃO — devolve LINHAS (o SQL Editor não mostra notice). Em cada
-- linha com `esperado`, `valor` tem de bater.
-- ============================================================================
with verif(n, item, valor, esperado) as (
  select 1, 'RLS ligado em user_requests',
         (select relrowsecurity from pg_class where oid = 'public.user_requests'::regclass)::text, 'true'
  union all
  select 2, 'policies de user_requests (nome:comando:papel)',
         (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' | ' order by policyname)
            from pg_policies where schemaname = 'public' and tablename = 'user_requests'),
         'user_requests_anon_insert:INSERT:anon | user_requests_gestao_delete:DELETE:authenticated | '
         || 'user_requests_gestao_select:SELECT:authenticated | user_requests_gestao_update:UPDATE:authenticated | '
         || 'user_requests_membro_insert:INSERT:authenticated'
  union all
  select 3, 'o INSERT anônimo confere empresa ativa',
         (select coalesce(with_check, '') like '%user_requests_empresa_ativa%'
            from pg_policies where schemaname = 'public' and tablename = 'user_requests'
             and policyname = 'user_requests_anon_insert')::text, 'true'
  union all
  select 4, 'DEFAULT de user_requests.company_id é jwt_company_id()',
         (select coalesce(column_default, '') like '%jwt_company_id()%' from information_schema.columns
           where table_schema = 'public' and table_name = 'user_requests' and column_name = 'company_id')::text,
         'true'
  union all
  select 5, 'anon executa user_requests_empresa_ativa (a policy do /cadastro precisa)',
         has_function_privilege('anon', 'public.user_requests_empresa_ativa(text)', 'EXECUTE')::text, 'true'
  union all
  select 6, 'PUBLIC/authenticated executam user_requests_empresa_ativa',
         (has_function_privilege('public', 'public.user_requests_empresa_ativa(text)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.user_requests_empresa_ativa(text)', 'EXECUTE'))::text, 'false'
  union all
  select 7, 'anon INSERE em user_requests (o /cadastro depende)',
         has_table_privilege('anon', 'public.user_requests', 'INSERT')::text, 'true'
  union all
  select 8, 'anon com SELECT/UPDATE/DELETE em user_requests (grant; o RLS nega de todo jeito)',
         (has_any_column_privilege('anon', 'public.user_requests', 'SELECT')
          or has_any_column_privilege('anon', 'public.user_requests', 'UPDATE')
          or has_table_privilege('anon', 'public.user_requests', 'DELETE'))::text, 'false'
  union all
  -- Não é desta migration (20260709_secure_user_requests): se vier true, a
  -- diretoria — a única que ainda lê a tabela — lê o PIN dos pedidos.
  select 9, 'authenticated lê a coluna pin (nem a diretoria pode)',
         has_column_privilege('authenticated', 'public.user_requests', 'pin', 'SELECT')::text, 'false'
  union all
  select 10, 'gatilho user_requests_company (deriva a empresa da loja)',
         (select count(*) from pg_trigger where tgrelid = 'public.user_requests'::regclass
             and tgname = 'user_requests_company' and not tgisinternal)::text, '1'
  union all
  -- Informativo: 1 se a 20260924_colaboradores_selfie_diretoria já rodou,
  -- 0 se ainda não. Esta migration não o cria nem o derruba.
  select 11, 'gatilho user_requests_selfie_trava (da migration da selfie; informativo)',
         (select count(*) from pg_trigger where tgrelid = 'public.user_requests'::regclass
             and tgname = 'user_requests_selfie_trava' and not tgisinternal)::text, ''
  union all
  -- Informativo: pedidos já gravados sem empresa ou em empresa inexistente/
  -- desativada. Não somem nem mudam — só não entram mais pedidos assim.
  select 12, 'pedidos PENDENTES sem empresa ativa (informativo)',
         (select count(*) from public.user_requests r
           where r.status = 'pendente' and not public.user_requests_empresa_ativa(r.company_id))::text, ''
)
select ord, bloco, item, valor, esperado from (
  select 100 + n as ord, 'VERIFICAÇÃO' as bloco, item, valor, esperado from verif
  union all
  select 500 + ord, 'SIMULAÇÃO', item, valor, esperado from _ur_sim
) tudo
order by ord;


-- ============================================================================
-- PRÉ-VOO (antes de aplicar; só leitura). Uma linha só, para caber na grade:
--
--   select
--     (select relrowsecurity from pg_class where oid = 'public.user_requests'::regclass) as rls_ligado,
--     (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' | ' order by policyname)
--        from pg_policies where schemaname = 'public' and tablename = 'user_requests') as policies,
--     (select string_agg(tgname, ', ' order by tgname) from pg_trigger
--       where tgrelid = 'public.user_requests'::regclass and not tgisinternal) as gatilhos,
--     (select column_default from information_schema.columns
--       where table_schema = 'public' and table_name = 'user_requests' and column_name = 'company_id') as default_empresa,
--     (select data_type from information_schema.columns
--       where table_schema = 'public' and table_name = 'companies' and column_name = 'active') as tipo_active;
--   -- esperado hoje:
--   --   true | user_requests_anon_insert:INSERT:anon | user_requests_tenant_rw:ALL:authenticated
--   --        | user_requests_company  (+ user_requests_selfie_trava, se a da selfie já rodou)
--   --        | NULL | boolean
--   -- Se `policies` trouxer QUALQUER outra coisa, a trava (5) vai abortar:
--   -- leia antes, e remova só o que for mesmo resto.
--
-- De onde vêm os pedidos hoje — quem a checagem de empresa ativa passaria a
-- recusar (linhas com empresa_ativa ≠ true nos últimos 30 dias = alguém
-- gravando pedido para empresa desativada/inexistente; ver se é abuso ou fluxo
-- legítimo ANTES de aplicar):
--
--   select coalesce(c.active::text, 'empresa inexistente ou nula') as empresa_ativa,
--          r.status, count(*) as pedidos,
--          count(*) filter (where r.created_at > now() - interval '30 days') as ultimos_30_dias
--     from public.user_requests r
--     left join public.companies c on c.id = r.company_id
--    group by 1, 2 order by 1, 2;
--
-- ── COMO CONFIRMAR NO APP — vale mais que a verificação acima ───────────────
--   1. /cadastro de uma empresa ATIVA, com selfie: chega à tela de sucesso.
--   2. Diretoria dessa empresa → aba Usuários: o pedido aparece; aprovar cria
--      o acesso e tira da fila; recusar outro pedido de teste tira da fila.
--   3. Colaborador → Meu ID → "Solicitar alteração de dados": a diretoria
--      recebe o pedido na fila. Repetir com uma conta de diretoria/gerência
--      SEM loja única — antes desta migration o pedido sumia calado.
--   4. Com o token de um COLABORADOR (localStorage zc_session_v1), direto no
--      PostgREST — tem de voltar [] / zero linhas:
--        curl -s '<URL>/rest/v1/user_requests?select=id,name,cpf' \
--          -H 'apikey: <ANON>' -H 'Authorization: Bearer <TOKEN DO COLABORADOR>'
--   5. Com a anon key, pedido para uma empresa inexistente — tem de voltar
--      42501 "new row violates row-level security policy":
--        curl -s -X POST '<URL>/rest/v1/user_requests' \
--          -H 'apikey: <ANON>' -H 'Authorization: Bearer <ANON>' \
--          -H 'Content-Type: application/json' \
--          -d '{"name":"teste","pin":"0000","company_id":"__nao_existe__","status":"pendente"}'
--
-- ── ROLLBACK de emergência ──────────────────────────────────────────────────
-- Se a fila da diretoria ficar vazia com pedido pendente no banco, ou o
-- /cadastro de uma empresa ativa recusar: devolve o estado anterior (e os
-- buracos junto — é saída de incêndio, não correção):
--   begin;
--   drop policy if exists user_requests_gestao_select on public.user_requests;
--   drop policy if exists user_requests_gestao_update on public.user_requests;
--   drop policy if exists user_requests_gestao_delete on public.user_requests;
--   drop policy if exists user_requests_membro_insert on public.user_requests;
--   create policy user_requests_tenant_rw on public.user_requests
--     for all to authenticated
--     using (company_id = public.jwt_company_id()) with check (company_id = public.jwt_company_id());
--   alter policy user_requests_anon_insert on public.user_requests with check (true);
--   commit;
-- O DEFAULT de company_id e a função podem ficar: só ajudam.
-- ============================================================================
