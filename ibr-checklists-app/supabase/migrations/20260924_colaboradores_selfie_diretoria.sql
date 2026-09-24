-- ============================================================================
-- 20260924_colaboradores_selfie_diretoria.sql
-- A selfie do /cadastro passa a ser lida só pela diretoria da empresa do pedido.
--
-- ── O que estava aberto ─────────────────────────────────────────────────────
-- O bucket `colaboradores` guarda a selfie de quem pede acesso pelo /cadastro
-- (e os objetos anteriores a 09/07/2026 têm o CPF no nome: `Date.now()-<cpf>.jpg`).
-- Três policies de SELECT o abriam por inteiro:
--
--   · colaboradores_signed_read               (20260709_private_selfie_bucket)
--       for select to anon using (bucket_id = 'colaboradores')
--   · colaboradores_signed_read_authenticated (20260709_authenticated_role_grants)
--       for select to authenticated using (bucket_id = 'colaboradores')
--   · anon_storage_all (feita à mão no dashboard, sem filtro de bucket)
--       for all to anon using (true) with check (true)
--
-- A anon key é pública (bundle, lib/supabase.js, repositório público): com ela,
-- qualquer um LISTA o bucket e baixa a selfie de todos os cadastros de todas as
-- empresas. Com um token de sessão de QUALQUER papel de QUALQUER empresa (um
-- colaborador; uma empresa em teste criada no /comecar), o mesmo.
-- O SelfieViewer (app/app/page.js) assinava a URL com o cliente anônimo.
--
-- ── O desenho ───────────────────────────────────────────────────────────────
-- O cliente assina a URL com o token da sessão (authedSupabase()). A policy
-- nova libera o objeto para `authenticated` só quando o token é da DIRETORIA
-- (`jwt_user_role() = 'gestao'` — a fila de cadastros só carrega para ela, e a
-- aprovação é só dela desde ed89ebf) e a empresa DONA da selfie é a do token.
--
-- Dono NÃO é "existe um pedido com esse caminho na minha empresa". `user_requests`
-- é gravável por qualquer um:
--   · anon:          user_requests_anon_insert é `with check (true)` — qualquer
--                    company_id, qualquer selfie_path;
--   · authenticated: user_requests_tenant_rw é FOR ALL na própria empresa, e o
--                    UPDATE alcança selfie_path.
-- E os caminhos de TODAS as selfies estiveram listáveis pela anon key até hoje:
-- tem de se supor que vazaram. Se ponteiro desse posse, bastava abrir uma empresa
-- em teste, inserir um pedido apontando para a selfie de outra empresa e assinar
-- a URL como diretoria dela.
--
-- Dono é a PRIMEIRA reivindicação feita logo depois do upload:
--
--   o pedido com selfie_path = nome do objeto, com created_at entre
--   (objeto.created_at − 5 min) e (objeto.created_at + 1 h), o mais antigo.
--
-- O /cadastro sobe a foto e grava o pedido em seguida (app/cadastro/page.js):
-- o pedido legítimo nasce segundos depois do objeto. Para essa comparação
-- valer, o `created_at` do pedido não pode ser escolhido por quem grava — o
-- gatilho `user_requests_selfie_trava` o força para now() no INSERT e o
-- congela no UPDATE, e recusa trocar selfie_path por outro caminho. Resultado:
--   · selfie antiga (caminho vazado): nenhum pedido novo cai na janela dela;
--   · selfie nova: o nome é um UUID que ninguém mais consegue listar, e o
--     pedido legítimo chega primeiro;
--   · pedido forjado dentro da janela não rouba nem esconde: o mais antigo vence.
-- A função recebe o nome e o created_at da PRÓPRIA linha de storage.objects
-- (a policy passa as colunas) — não lê o storage, só `user_requests`.
--
-- ── O upload anônimo do /cadastro continua ──────────────────────────────────
-- Com `upsert: false` (é o que o /cadastro usa) o storage-api precisa só de
-- INSERT. Conferido no código do storage-api (github.com/supabase/storage,
-- master de 24/09/2026 e tag v1.0.0):
--   · uploader.ts, canUpload(): sem upsert → testPermission(db.createObject(...))
--     — o INSERT roda COM O PAPEL de quem chama, dentro de uma transação
--     desfeita de propósito; é só o teste do RLS;
--   · database/pg.ts, createObject(): `INSERT INTO storage.objects (...) VALUES
--     (...)` — SEM RETURNING (v1.0.0, database/knex.ts: `.insert(object)`, idem);
--   · completeUpload(): a gravação de verdade é `this.db.asSuperUser()`.
-- Com upsert o caminho é upsertObject(): INSERT … ON CONFLICT DO UPDATE …
-- RETURNING * — aí sim precisaria de SELECT e UPDATE. O /cadastro não usa.
-- Por isso a leitura anônima sai INTEIRA, sem janela de "objetos recentes" —
-- que, aliás, entregaria cada selfie nova a quem consultasse o bucket a cada
-- minuto. O teste PGlite prova a premissa: INSERT puro do anon passa,
-- INSERT … RETURNING do anon é recusado.
--
-- ── Ordem de publicação ─────────────────────────────────────────────────────
--   1. Rodar a consulta PRÉ-VOO do rodapé (só leitura).
--   2. Deploy do cliente (SelfieViewer com authedSupabase). Se a PRÉ-VOO mostrou
--      `colaboradores_signed_read_authenticated`, a diretoria segue vendo a
--      selfie no bundle novo desde já; se não mostrou, o bundle novo fica
--      com "Selfie não disponível" até o passo 3 — rode os dois em seguida.
--   3. ESTA migration. Bundle velho (cliente anônimo) passa a mostrar "Selfie
--      não disponível" até recarregar: falha visível, só na tela de aprovação.
-- Independe de 20260924_storage_01 (checklist-photos): aqui o `anon_storage_all`
-- só perde o bucket `colaboradores`; a 01 derruba o que sobrar dela depois.
-- Rodam em qualquer ordem.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Mandar o arquivo INTEIRO numa execução só: vários comandos numa
-- consulta rodam numa transação implícita, e a trava do fim (4) DESFAZ TUDO se
-- ainda sobrar leitura de selfie para quem não é a diretoria dona. A mensagem
-- de erro lista as policies de SELECT que sobraram.
-- Teste: node supabase/migrations/20260924_colaboradores_selfie_diretoria.test.mjs
-- ============================================================================


-- ── 0. Travas ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'colaboradores') then
    raise exception 'bucket colaboradores não existe neste projeto. Nada foi aplicado.';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'user_requests'
         and column_name in ('selfie_path', 'company_id', 'created_at')) <> 3 then
    raise exception 'public.user_requests sem selfie_path/company_id/created_at. Nada foi aplicado.';
  end if;
end $$;

-- Bucket privado: com ele público, a URL /object/public/ abriria qualquer
-- selfie sem passar por policy nenhuma.
update storage.buckets set public = false
 where id = 'colaboradores' and public is distinct from false;


-- ── 1. A reivindicação da selfie não se forja ───────────────────────────────
-- INSERT: created_at é o relógio do banco, nunca o que veio na requisição (o
-- anon tem INSERT em todas as colunas de user_requests).
-- UPDATE: created_at não muda; selfie_path só pode virar NULL (apagar a selfie
-- de um pedido), nunca apontar para outro objeto. O app não escreve nenhuma das
-- duas colunas depois do /cadastro (aprovação e recusa mexem em status, nome,
-- nota, papel, setor e revisão).
create or replace function public.user_requests_selfie_trava()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
    if new.selfie_path is distinct from old.selfie_path and new.selfie_path is not null then
      raise exception 'selfie_path de um pedido de cadastro não pode ser trocado'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists user_requests_selfie_trava on public.user_requests;
create trigger user_requests_selfie_trava
  before insert or update on public.user_requests
  for each row execute function public.user_requests_selfie_trava();

create index if not exists user_requests_selfie_path_idx
  on public.user_requests (selfie_path) where selfie_path is not null;


-- ── 2. Dono e visibilidade ──────────────────────────────────────────────────
-- A empresa dona do objeto: a do pedido MAIS ANTIGO que o cita dentro da
-- janela do upload. NULL se ninguém o reivindicou a tempo.
-- SECURITY DEFINER: lê `user_requests` inteira (a diretoria só enxerga a da
-- própria empresa pelo RLS, e a regra precisa ver a reivindicação das outras).
-- search_path vazio e tudo qualificado: nada de `public`/`pg_temp` na frente.
create or replace function public.colaboradores_selfie_dono(p_name text, p_created_at timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.company_id
    from public.user_requests r
   where r.selfie_path = p_name
     and r.created_at >= p_created_at - interval '5 minutes'
     and r.created_at <  p_created_at + interval '1 hour'
   order by r.created_at, r.id
   limit 1
$$;

-- A pergunta da policy: o token é da diretoria da empresa dona?
create or replace function public.colaboradores_selfie_visivel(p_name text, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           public.jwt_user_role() = 'gestao'
           and public.colaboradores_selfie_dono(p_name, p_created_at) = public.jwt_company_id(),
           false)
$$;

-- Função nova nasce com EXECUTE para PUBLIC (Postgres) e para anon/authenticated
-- (default privileges do Supabase) — e o PostgREST expõe como /rpc. O
-- `authenticated` precisa executar a `_visivel` (a expressão da policy roda com o
-- papel de quem consulta); a `_dono` roda por dentro dela, como a dona, e não
-- fica exposta a ninguém. O gatilho não depende de EXECUTE para disparar.
revoke all on function public.colaboradores_selfie_dono(text, timestamptz)    from public, anon, authenticated;
revoke all on function public.colaboradores_selfie_visivel(text, timestamptz) from public, anon, authenticated;
revoke all on function public.user_requests_selfie_trava()                    from public, anon, authenticated;
grant execute on function public.colaboradores_selfie_visivel(text, timestamptz) to authenticated;


-- ── 3. Policies do bucket ───────────────────────────────────────────────────
drop policy if exists colaboradores_signed_read               on storage.objects;
drop policy if exists colaboradores_signed_read_authenticated on storage.objects;

drop policy if exists colaboradores_leitura_diretoria on storage.objects;
create policy colaboradores_leitura_diretoria
  on storage.objects for select
  to authenticated
  using (bucket_id = 'colaboradores'
         and public.colaboradores_selfie_visivel(name, created_at));

-- `anon_storage_all` perde o bucket das selfies e mais nada: a expressão que
-- estiver lá (a original `true`, ou a confinada a checklist-photos de
-- 20260731) ganha `bucket_id <> 'colaboradores'` na frente. O /cadastro sobe
-- pela `colaboradores_anon_insert`, que fica. Se a 20260924_storage_01 já
-- derrubou a `anon_storage_all`, não há o que fazer aqui.
do $$
declare p record;
begin
  select qual, with_check into p
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'anon_storage_all';
  if found and position('colaboradores' in coalesce(p.qual, '') || coalesce(p.with_check, '')) = 0 then
    if p.qual is not null then
      execute format('alter policy anon_storage_all on storage.objects using (bucket_id <> %L and (%s))',
                     'colaboradores', p.qual);
    end if;
    if p.with_check is not null then
      execute format('alter policy anon_storage_all on storage.objects with check (bucket_id <> %L and (%s))',
                     'colaboradores', p.with_check);
    end if;
  end if;
end $$;


-- ── 4. Trava: o próprio banco responde quem enxerga as selfies ──────────────
-- Conferir nome de policy não basta: 20260709 já avisava que a leitura do anon
-- "provavelmente já existe sob outro nome", e o dashboard cria policy sem
-- migration. Então a pergunta vai para o Postgres, com o papel e o token que o
-- storage-api usaria:
--   · anon;
--   · diretoria de uma empresa que não existe (não é dona de nada);
--   · diretoria e colaborador da empresa DONA de mais selfies (pela regra da
--     seção 2 — não a que tem mais pedidos citando selfies: essa pode ser
--     justamente quem forjou pedidos).
-- Qualquer selfie visível fora da regra DESFAZ A MIGRATION INTEIRA.
drop table if exists _colab_sim;
create temp table _colab_sim (ord int, item text, valor text, esperado text);

do $$
declare
  v_claims   text := current_setting('request.jwt.claims', true);
  v_empresa  text;
  v_total    bigint;
  n_anon     bigint;
  n_sonda    bigint;
  n_colab    bigint;
  v_vistos   text[];
  n_propria  bigint;
  n_alheia   bigint;
  n_dono     bigint;
  v_simulou  boolean := true;
  v_lista    text;
begin
  select count(*) into v_total from storage.objects where bucket_id = 'colaboradores';

  select d.dono, count(*) into v_empresa, n_dono
    from storage.objects o
    cross join lateral (select public.colaboradores_selfie_dono(o.name, o.created_at) as dono) d
   where o.bucket_id = 'colaboradores' and d.dono is not null
   group by d.dono
   order by count(*) desc, d.dono
   limit 1;

  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    select count(*) into n_anon from storage.objects where bucket_id = 'colaboradores';
    reset role;

    perform set_config('request.jwt.claims', json_build_object(
      'role', 'authenticated', 'company_id', '__sonda_sem_empresa__',
      'user_id', '__sonda__', 'user_role', 'gestao')::text, true);
    set local role authenticated;
    select count(*) into n_sonda from storage.objects where bucket_id = 'colaboradores';
    reset role;

    if v_empresa is not null then
      perform set_config('request.jwt.claims', json_build_object(
        'role', 'authenticated', 'company_id', v_empresa,
        'user_id', '__sonda__', 'user_role', 'colaborador')::text, true);
      set local role authenticated;
      select count(*) into n_colab from storage.objects where bucket_id = 'colaboradores';
      reset role;

      perform set_config('request.jwt.claims', json_build_object(
        'role', 'authenticated', 'company_id', v_empresa,
        'user_id', '__sonda__', 'user_role', 'gestao')::text, true);
      set local role authenticated;
      select coalesce(array_agg(name), '{}') into v_vistos
        from storage.objects where bucket_id = 'colaboradores';
      reset role;

      -- Classifica como dona da tabela: das vistas, quantas NÃO têm pedido da
      -- empresa simulada?
      select count(*) into n_alheia
        from unnest(v_vistos) as v(name)
       where not exists (select 1 from public.user_requests r
                          where r.selfie_path = v.name and r.company_id = v_empresa);
      n_propria := cardinality(v_vistos) - n_alheia;
    end if;
  exception when insufficient_privilege then
    -- O `postgres` do SQL Editor não conseguiu assumir anon/authenticated.
    v_simulou := false;
  end;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  insert into _colab_sim values
    (1, 'objetos no bucket colaboradores', v_total::text, ''),
    (2, 'simulação rodou (postgres assumiu anon/authenticated)', v_simulou::text, 'true'),
    (3, 'anon enxerga selfies', coalesce(n_anon::text, '—'), '0'),
    (4, 'diretoria de empresa inexistente enxerga selfies', coalesce(n_sonda::text, '—'), '0'),
    (5, 'COLABORADOR da empresa dona de mais selfies enxerga selfies', coalesce(n_colab::text, '—'), '0'),
    (6, 'diretoria dessa empresa enxerga selfies de OUTRA empresa', coalesce(n_alheia::text, '—'), '0'),
    (7, 'diretoria dessa empresa enxerga as PRÓPRIAS selfies (todas as que a regra lhe dá)',
        coalesce(n_propria::text, '—'), coalesce(n_dono::text, '— (nenhuma selfie com dono)'));

  if coalesce(n_anon, 0) > 0 or coalesce(n_sonda, 0) > 0
     or coalesce(n_colab, 0) > 0 or coalesce(n_alheia, 0) > 0 then
    select string_agg(policyname || ' [' || cmd || ' · ' || array_to_string(roles, ',') || ']: '
                      || coalesce(qual, '—'), E'\n' order by policyname)
      into v_lista
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and cmd in ('SELECT', 'ALL')
       and roles && array['anon', 'authenticated', 'public']::name[];
    raise exception E'Selfie ainda legível fora da regra (anon %, sem empresa %, colaborador %, outra empresa %). NADA foi aplicado. Policies de leitura em storage.objects:\n%',
      coalesce(n_anon, 0), coalesce(n_sonda, 0), coalesce(n_colab, 0), coalesce(n_alheia, 0), v_lista;
  end if;
end $$;


-- ============================================================================
-- VERIFICAÇÃO — em VERIFICAÇÃO e SIMULAÇÃO, `valor` tem de bater com `esperado`.
-- A linha 7 da SIMULAÇÃO é a prova de que a diretoria continua vendo: menor
-- que o esperado (0, tipicamente) quer dizer que a função não enxergou
-- `user_requests` como dona da tabela — a tela de aprovação ficou sem selfie.
-- ============================================================================
with verif(n, item, valor, esperado) as (
  select 1, 'colaboradores_signed_read (anon) ainda existe',
         (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'colaboradores_signed_read')::text, '0'
  union all
  select 2, 'colaboradores_signed_read_authenticated ainda existe',
         (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'colaboradores_signed_read_authenticated')::text, '0'
  union all
  select 3, 'colaboradores_leitura_diretoria existe',
         (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'colaboradores_leitura_diretoria')::text, '1'
  union all
  select 4, 'colaboradores_anon_insert existe (o /cadastro sobe a selfie por ela)',
         (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'colaboradores_anon_insert' and cmd = 'INSERT')::text, '1'
  union all
  select 5, 'bucket colaboradores público?',
         (select public::text from storage.buckets where id = 'colaboradores'), 'false'
  union all
  select 6, 'PUBLIC/anon executam colaboradores_selfie_visivel',
         (has_function_privilege('public', 'public.colaboradores_selfie_visivel(text, timestamptz)', 'EXECUTE')
          or has_function_privilege('anon', 'public.colaboradores_selfie_visivel(text, timestamptz)', 'EXECUTE'))::text, 'false'
  union all
  select 7, 'authenticated executa colaboradores_selfie_visivel (a policy precisa)',
         has_function_privilege('authenticated', 'public.colaboradores_selfie_visivel(text, timestamptz)', 'EXECUTE')::text, 'true'
  union all
  select 8, 'PUBLIC/anon/authenticated executam colaboradores_selfie_dono',
         (has_function_privilege('public', 'public.colaboradores_selfie_dono(text, timestamptz)', 'EXECUTE')
          or has_function_privilege('anon', 'public.colaboradores_selfie_dono(text, timestamptz)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.colaboradores_selfie_dono(text, timestamptz)', 'EXECUTE'))::text, 'false'
  union all
  select 9, 'gatilho user_requests_selfie_trava existe',
         (select count(*) from pg_trigger
           where tgrelid = 'public.user_requests'::regclass and tgname = 'user_requests_selfie_trava'
             and not tgisinternal)::text, '1'
  union all
  -- Pedido com selfie cujo objeto existe, mas que ninguém reivindicou dentro da
  -- janela do upload: NINGUÉM vê essa selfie. Esperado 0; se não for, ver a
  -- consulta PEDIDOS SEM SELFIE no rodapé.
  select 10, 'pedidos cuja selfie ficou sem dono (a diretoria deixaria de ver)',
         (select count(*) from public.user_requests r
            join storage.objects o on o.bucket_id = 'colaboradores' and o.name = r.selfie_path
           where public.colaboradores_selfie_dono(o.name, o.created_at) is null)::text, '0'
  union all
  -- Pedido que cita a selfie de OUTRA empresa (chegou depois da dona ou fora
  -- da janela). O nome é um UUID por cadastro: não há caso legítimo. Diferente
  -- de 0 é rastro de alguém que listou o bucket e apontou um pedido para a
  -- selfie alheia ANTES desta migration — investigar com PEDIDOS SEM SELFIE.
  select 11, 'pedidos que citam a selfie de outra empresa',
         (select count(*) from public.user_requests r
            join storage.objects o on o.bucket_id = 'colaboradores' and o.name = r.selfie_path
           where public.colaboradores_selfie_dono(o.name, o.created_at) <> r.company_id)::text, '0'
  union all
  select 12, 'pedidos com selfie_path sem objeto no bucket (informativo)',
         (select count(*) from public.user_requests r
           where r.selfie_path is not null
             and not exists (select 1 from storage.objects o
                              where o.bucket_id = 'colaboradores' and o.name = r.selfie_path))::text, ''
  union all
  select 13, 'tipo de user_requests.created_at (informativo; timestamptz é o esperado)',
         (select data_type from information_schema.columns
           where table_schema = 'public' and table_name = 'user_requests' and column_name = 'created_at'), ''
  union all
  -- O pedido pedia para cobrir `users.selfie_path` "se existir". Não existe em
  -- nenhuma migration nem no código; o pedido aprovado continua em
  -- user_requests, e é por ele que a selfie segue visível. Se vier true, há
  -- uma coluna feita à mão que esta policy NÃO cobre.
  select 14, 'users.selfie_path existe',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'users' and column_name = 'selfie_path')::text, 'false'
)
select ord, bloco, item, valor, esperado from (
  select 100 + n as ord, 'VERIFICAÇÃO' as bloco, item, valor, esperado from verif
  union all
  select 500 + ord, 'SIMULAÇÃO', item, valor, esperado from _colab_sim
  union all
  -- Toda leitura que sobra em storage.objects para anon/authenticated/public,
  -- para conferir de olho: nenhuma pode valer para bucket_id 'colaboradores'
  -- além de colaboradores_leitura_diretoria.
  select 900, 'LEITURA RESTANTE', policyname,
         cmd || ' · ' || array_to_string(roles, ',') || ' · ' || coalesce(qual, '—'), ''
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and cmd in ('SELECT', 'ALL')
     and roles && array['anon', 'authenticated', 'public']::name[]
) tudo
order by ord, item;


-- ============================================================================
-- PRÉ-VOO (antes do deploy; só leitura) — o que existe hoje no bucket:
--
--   select policyname, cmd, roles, qual, with_check from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and (policyname like 'colaboradores%' or policyname = 'anon_storage_all'
--           or qual is null or qual not like '%bucket_id%')
--    order by policyname;
--
-- PEDIDOS SEM SELFIE (se a verificação 10 ou 11 não vier 0) — quais pedidos perdem a
-- selfie e por quê (defasagem entre upload e pedido fora da janela, ou outro
-- pedido reivindicou antes):
--
--   select r.id, r.company_id, r.status, r.created_at as pedido, o.created_at as upload,
--          r.created_at - o.created_at as defasagem,
--          public.colaboradores_selfie_dono(o.name, o.created_at) as dono_pela_regra
--     from public.user_requests r
--     join storage.objects o on o.bucket_id = 'colaboradores' and o.name = r.selfie_path
--    where public.colaboradores_selfie_dono(o.name, o.created_at) is distinct from r.company_id;
--
-- COMO CONFIRMAR NO APP — vale mais que a verificação acima
--   1. /cadastro de uma empresa de teste, com selfie: tem de chegar à tela de
--      sucesso (o upload anônimo e o INSERT do pedido seguem abertos).
--   2. Diretoria dessa empresa, aba Usuários → pedido pendente: a selfie abre.
--   3. Do terminal, com a anon key: listar o bucket tem de voltar vazio.
--        curl -s -X POST '<URL>/storage/v1/object/list/colaboradores' \
--          -H 'apikey: <ANON>' -H 'Authorization: Bearer <ANON>' \
--          -H 'Content-Type: application/json' -d '{"prefix":"","limit":5}'
--        -- esperado: []
--   4. Com o token de um COLABORADOR (localStorage zc_session_v1 de uma sessão
--      de colaborador), a mesma listagem e o createSignedUrl de um caminho real
--      têm de falhar/voltar vazio.
--
-- ROLLBACK de emergência (se a diretoria ficar sem selfie e não der para
-- esperar a correção). Devolve leitura a TODA diretoria de TODA empresa — é
-- saída de incêndio, bem mais estreita que o estado anterior (anon e todo token):
--   create policy colaboradores_signed_read_authenticated on storage.objects
--     for select to authenticated
--     using (bucket_id = 'colaboradores' and public.jwt_user_role() = 'gestao');
-- O gatilho e as funções podem ficar: não afetam o /cadastro.
-- ============================================================================
