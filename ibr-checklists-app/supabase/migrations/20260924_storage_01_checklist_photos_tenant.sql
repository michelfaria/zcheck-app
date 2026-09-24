-- ============================================================================
-- STORAGE 1/3 — `checklist-photos` passa a ser isolado por empresa.
--
-- ── O problema (confirmado no código em 24/09/2026) ─────────────────────────
-- Fotos de prova, fotos da rodada e POPs de TODAS as empresas moram no bucket
-- `checklist-photos`, em caminhos sem empresa:
--
--     {conclusão}/{item}.jpg
--     rodada/{checklist}/{loja}/{dia}/{item}.jpg
--     refdocs/{ts}-{aleatório}/{arquivo}
--
-- e o app lia e gravava pelo cliente ANÔNIMO. A policy `anon_storage_all`
-- (criada à mão no dashboard, `for all to anon using (true)`, sem filtro de
-- bucket — ver 20260731_storage_checklist_photos.sql) deixa quem tem a anon key
-- LISTAR, baixar, sobrescrever, mover e apagar qualquer objeto de qualquer
-- bucket. A anon key é pública: vai no bundle e está em lib/supabase.js, e o
-- repositório é público. Foi por isso que o "Isolados por empresa" saiu do FAQ
-- da landing em 24/09/2026.
--
-- ── Medido em produção (auditoria de 24/09/2026, supabase/auditoria/) ───────
--   · `anon_storage_all` JÁ estava confinada a `checklist-photos` (o passo 2
--     da 20260731 foi aplicado; o passo 1 não — não há policy de
--     authenticated no bucket). Continua `for all`: o anon lista, baixa, move,
--     sobrescreve e APAGA qualquer foto e POP;
--   · bucket privado, 2.062 objetos, TODOS em caminho antigo e subidos sem
--     token: 977 provas (58 MB), 1.083 de rodada (62 MB), 2 POPs (4 MB);
--   · uma empresa só em `companies` (`ibr-li53392s`). Prévia do inventário:
--     1.976 `dono` (todos dela), 86 `sem_dono` (77 provas e 7 de rodada sem
--     conclusão/loja correspondente; os 2 POPs, que nenhum template cita mais),
--     nenhum `revisar`/`conflito`, nenhuma colisão de id.
--
-- ── O desenho ───────────────────────────────────────────────────────────────
-- Objeto novo nasce em `{company_id}/<caminho de antes>` e sobe pelo cliente
-- AUTENTICADO. A policy compara a 1ª pasta com o company_id do token — o mesmo
-- padrão de `company-logos` (20260717) e `user-avatars` (20260726), que já
-- funcionam em produção com o token de /api/auth/session.
--
-- Objeto ANTIGO não tem pasta de empresa, então a policy por pasta não o
-- alcança. O dono de cada um é descoberto UMA vez, pela estrutura do banco, e
-- congelado em `public.checklist_photos_legado`:
--
--   {conclusão}/{item}.jpg      → completions.company_id (pela chave primária)
--   rodada/{chk}/{loja}/...     → units e templates (pela chave primária)
--   refdocs/...                 → o template que referencia o caminho
--
-- Congelado de propósito. `photos`, `live_tasks` e o JSON de `templates` são
-- graváveis por qualquer empresa — alguém que conhecesse o caminho (e a
-- listagem anônima entregava todos) poderia apontar uma linha SUA para o objeto
-- de outra e virar "dono" num cálculo feito a cada leitura. Ponteiro sozinho
-- nunca dá posse: vira `revisar`, para decisão manual.
--
-- ── As fases, NESTA ordem ───────────────────────────────────────────────────
--   A. ESTA migration. Aditiva para o app de hoje: o cliente anônimo continua
--      lendo e subindo foto em caminho antigo. O que ela já fecha:
--        · o anon sai de TODOS os outros buckets (o `anon_storage_all` valia
--          para todos) e deixa de APAGAR, MOVER e SOBRESCREVER em
--          `checklist-photos`;
--        · o anon não enxerga nem cria nada dentro de pasta de empresa — o que
--          sobe pelo app novo já nasce fechado.
--   B. Deploy do cliente (lib/sync.js + lib/photoPaths.js).
--   C. Cópia do legado para a pasta da empresa, pela rota
--      /api/admin/storage-migrate (service_role; ação `copiar`). Repetível.
--   D. 20260924_storage_02_revoga_anon.sql — o anon sai de `checklist-photos`.
--      Só quando nenhum aparelho estiver mais no bundle antigo (ver o
--      cabeçalho dela: há uma consulta que mostra isso).
--   E. 20260924_storage_03_fecha_legado.sql — derruba a leitura do legado e
--      libera apagar os objetos antigos já copiados.
--
-- Rodar ESTA antes do deploy (B): o cliente novo grava na pasta da empresa, e
-- sem as policies daqui o upload dele é recusado.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Os diagnósticos voltam como LINHAS no fim (o SQL Editor não
-- mostra `raise notice`). ROLLBACK no rodapé.
-- Teste: 20260924_storage_checklist_photos.test.mjs (PGlite).
-- ============================================================================


-- ── 0. Travas ───────────────────────────────────────────────────────────────
-- (a) Uma empresa com id `rodada` ou `refdocs` teria a pasta com o MESMO nome
--     do prefixo dos objetos antigos: a policy por pasta daria a ela as fotos de
--     rodada ou os POPs de todo mundo. Id com barra quebraria a 1ª pasta.
do $$
declare v text;
begin
  select string_agg(id, ', ') into v
    from public.companies
   where id in ('rodada', 'refdocs') or id like '%/%' or id in ('', '.', '..');
  if v is not null then
    raise exception 'empresa(s) com id incompatível com a pasta do storage: %. '
                    'Nada foi aplicado.', v;
  end if;
end $$;

-- (b) Bucket privado. O app só usa URL assinada; se o bucket estivesse público,
--     qualquer objeto abriria pela URL pública sem passar por policy nenhuma.
update storage.buckets set public = false
 where id = 'checklist-photos' and public is distinct from false;


-- ── 1. Inventário do legado ─────────────────────────────────────────────────
create table if not exists public.checklist_photos_legado (
  name            text primary key,               -- nome do objeto antigo
  tipo            text not null,                  -- prova | rodada | refdoc | outro
  company_id      text,                           -- só quando status = 'dono'
  status          text not null,                  -- dono | conflito | revisar | sem_dono
  detalhe         text,
  inventariado_em timestamptz not null default now(),
  copiado_em      timestamptz,                    -- cópia em {company_id}/{name} confirmada
  apagado_em      timestamptz,                    -- objeto antigo removido (ou sumiu)
  erro            text
);

-- Ninguém do app lê nem escreve aqui: a policy do storage consulta por uma
-- função SECURITY DEFINER, e a rota de migração usa a service_role. Revogar é
-- obrigatório — os default privileges do Supabase dão tudo (até TRUNCATE) a
-- anon/authenticated em toda tabela nova do `public`.
alter table public.checklist_photos_legado enable row level security;
revoke all on public.checklist_photos_legado from public, anon, authenticated;
grant select, insert, update on public.checklist_photos_legado to service_role;


-- O objeto está na pasta de uma empresa? (`{company_id}/...`)
-- SECURITY DEFINER para não depender do que o anon lê em `companies` — se a
-- leitura anônima de `companies` for estreitada um dia, a policy não muda.
create or replace function public.checklist_photos_pasta_de_empresa(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select position('/' in coalesce(p_name, '')) > 0
     and exists (select 1 from public.companies c where c.id = split_part(p_name, '/', 1))
$$;


-- Varre o bucket e registra o dono de cada objeto ANTIGO. Repetível: linha já
-- classificada como `dono` ou `conflito` não muda (ver cabeçalho); `sem_dono` e
-- `revisar` são reavaliadas — a conclusão pode ter chegado depois.
create or replace function public.checklist_photos_inventariar_legado()
returns table (situacao text, objetos bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  with legado as (
    select o.name,
           case when o.name like 'rodada/%'       then 'rodada'
                when o.name like 'refdocs/%'      then 'refdoc'
                when o.name ~ '^[^/]+/[^/]+$'     then 'prova'
                else 'outro' end as tipo
      from storage.objects o
     where o.bucket_id = 'checklist-photos'
       and not public.checklist_photos_pasta_de_empresa(o.name)
  ),
  refdocs as (
    select t.company_id, d->>'path' as path
      from public.templates t
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(t.items) = 'array' then t.items else '[]'::jsonb end) it
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(it->'refDocs') = 'array' then it->'refDocs' else '[]'::jsonb end) d
  ),
  -- Posse pela ESTRUTURA. A sanitização de `rodada/` é a mesma do cliente
  -- (lib/photoPaths.js → roundPath) e do reparo 20260731_photos_metadata_repair_2.
  estrutural as (
    select l.name, c.company_id
      from legado l join public.completions c on c.id = split_part(l.name, '/', 1)
     where l.tipo = 'prova'
    union
    select l.name, u.company_id
      from legado l join public.units u
        on regexp_replace(u.id, '[^\w.-]+', '_', 'g') = split_part(l.name, '/', 3)
     where l.tipo = 'rodada'
    union
    select l.name, t.company_id
      from legado l join public.templates t
        on regexp_replace(t.id, '[^\w.-]+', '_', 'g') = split_part(l.name, '/', 2)
     where l.tipo = 'rodada'
    union
    select l.name, r.company_id
      from legado l join refdocs r on r.path = l.name
     where l.tipo = 'refdoc'
  ),
  -- Ponteiros: linhas que CITAM o objeto. Nunca dão posse sozinhos.
  ponteiro as (
    select l.name, p.company_id from legado l join public.photos p on p.storage_path = l.name
    union
    select l.name, t.company_id from legado l join public.live_tasks t on t.photo_path = l.name
  ),
  donos as (
    select name, array_agg(distinct company_id order by company_id) as donos
      from estrutural where company_id is not null group by name
  ),
  ponteiros as (
    select name, array_agg(distinct company_id order by company_id) as ponteiros
      from ponteiro where company_id is not null group by name
  ),
  classificado as (
    select l.name, l.tipo, d.donos, p.ponteiros,
           case when cardinality(d.donos) = 1                          then 'dono'
                -- POP citado por templates de mais de uma empresa: pode ser
                -- cópia legítima de template ou alguém apontando para o POP
                -- alheio. Não dá para saber daqui — decisão manual.
                when cardinality(d.donos) > 1 and l.tipo = 'refdoc'   then 'revisar'
                when cardinality(d.donos) > 1                          then 'conflito'
                when cardinality(p.ponteiros) > 0                      then 'revisar'
                else 'sem_dono' end as status
      from legado l
      left join donos d using (name)
      left join ponteiros p using (name)
  )
  insert into public.checklist_photos_legado as x (name, tipo, company_id, status, detalhe)
  select name, tipo,
         case when status = 'dono' then donos[1] end,
         status,
         concat_ws('; ',
           case when cardinality(donos) > 1
                then 'estrutura aponta ' || array_to_string(donos, ', ') end,
           case when ponteiros is not null
                 and (donos is null or not ponteiros <@ donos)
                then 'citado por ' || array_to_string(ponteiros, ', ') end)
    from classificado
  on conflict (name) do update
     set tipo = excluded.tipo, company_id = excluded.company_id,
         status = excluded.status, detalhe = excluded.detalhe,
         inventariado_em = now()
   where x.status in ('sem_dono', 'revisar') and x.copiado_em is null;

  return query
    select l.status, count(*) from public.checklist_photos_legado l
     group by l.status order by l.status;
end $$;


-- A empresa do token é dona deste objeto antigo? É o que a policy de leitura
-- do legado pergunta. Só `dono`, só a empresa registrada.
create or replace function public.checklist_photos_legado_visivel(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.checklist_photos_legado l
     where l.name = p_name
       and l.status = 'dono'
       and l.apagado_em is null
       and l.company_id = public.jwt_company_id())
$$;


-- Depois da cópia, aponta as linhas para o nome novo. `photos` é o que importa:
-- o `cleanup-photos` apaga pelo `storage_path` — com o nome velho ele apagaria
-- o objeto antigo e a cópia ficaria para sempre, fora da retenção de 90 dias.
-- Só reescreve linha DA EMPRESA DONA: um ponteiro de outra empresa para o mesmo
-- objeto fica com o nome velho e morre com a leitura do legado.
-- `templates` (POP) não é reescrito: o cliente qualifica o caminho com a empresa
-- do token na leitura (lib/photoPaths.js), e editar JSON de template em lote
-- disputaria com a gestão editando o mesmo template.
create or replace function public.checklist_photos_reescrever_referencias()
returns table (tabela text, linhas bigint)
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  update public.photos p
     set storage_path = l.company_id || '/' || l.name
    from public.checklist_photos_legado l
   where l.status = 'dono' and l.copiado_em is not null
     and p.storage_path = l.name and p.company_id = l.company_id;
  get diagnostics n = row_count;
  tabela := 'photos'; linhas := n; return next;

  update public.live_tasks t
     set photo_path = l.company_id || '/' || l.name
    from public.checklist_photos_legado l
   where l.status = 'dono' and l.copiado_em is not null
     and t.photo_path = l.name and t.company_id = l.company_id;
  get diagnostics n = row_count;
  tabela := 'live_tasks'; linhas := n; return next;
end $$;


-- Funções novas nascem com EXECUTE para PUBLIC (Postgres) e para
-- anon/authenticated (default privileges do Supabase) — e o PostgREST as expõe
-- como /rpc. Cada uma volta para quem precisa dela:
--   · pasta_de_empresa  → anon (policies de transição, até a fase D)
--   · legado_visivel    → authenticated (policy de leitura do legado)
--   · inventariar / reescrever → só service_role (rota de migração) e o dono.
revoke all on function public.checklist_photos_pasta_de_empresa(text)      from public, anon, authenticated;
revoke all on function public.checklist_photos_inventariar_legado()        from public, anon, authenticated;
revoke all on function public.checklist_photos_legado_visivel(text)        from public, anon, authenticated;
revoke all on function public.checklist_photos_reescrever_referencias()    from public, anon, authenticated;
grant execute on function public.checklist_photos_pasta_de_empresa(text)   to anon;
grant execute on function public.checklist_photos_legado_visivel(text)     to authenticated;
grant execute on function public.checklist_photos_inventariar_legado()     to service_role;
grant execute on function public.checklist_photos_reescrever_referencias() to service_role;


-- ── 2. Policies do bucket ───────────────────────────────────────────────────
-- As `checklist_photos_authenticated_*` da 20260731 (que não foi aplicada, mas
-- pode ter sido depois) liberavam o BUCKET INTEIRO para qualquer sessão — de
-- qualquer empresa. Policies permissivas se somam: se existirem, anulariam o
-- escopo por pasta abaixo. Saem.
drop policy if exists checklist_photos_authenticated_read   on storage.objects;
drop policy if exists checklist_photos_authenticated_insert on storage.objects;
drop policy if exists checklist_photos_authenticated_update on storage.objects;

-- (a) Sessão do app: só a pasta da própria empresa. Sem DELETE — o app não
--     apaga foto; quem apaga é o `cleanup-photos`, com service_role.
--     UPDATE existe porque o upload usa `upsert: true` (a fila retenta), e
--     sobrescrever objeto existente é UPDATE.
drop policy if exists checklist_photos_tenant_leitura on storage.objects;
create policy checklist_photos_tenant_leitura
  on storage.objects for select
  to authenticated
  using (bucket_id = 'checklist-photos'
         and (storage.foldername(name))[1] = public.jwt_company_id());

drop policy if exists checklist_photos_tenant_envio on storage.objects;
create policy checklist_photos_tenant_envio
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'checklist-photos'
              and (storage.foldername(name))[1] = public.jwt_company_id());

drop policy if exists checklist_photos_tenant_regravacao on storage.objects;
create policy checklist_photos_tenant_regravacao
  on storage.objects for update
  to authenticated
  using      (bucket_id = 'checklist-photos'
              and (storage.foldername(name))[1] = public.jwt_company_id())
  with check (bucket_id = 'checklist-photos'
              and (storage.foldername(name))[1] = public.jwt_company_id());

-- (b) Objeto antigo: só LEITURA, só para a empresa dona no inventário. Sai na
--     fase E (20260924_storage_03_fecha_legado.sql).
drop policy if exists checklist_photos_legado_leitura on storage.objects;
create policy checklist_photos_legado_leitura
  on storage.objects for select
  to authenticated
  using (bucket_id = 'checklist-photos'
         and public.checklist_photos_legado_visivel(name));

-- (c) TRANSIÇÃO do anon. O bundle que está nos celulares hoje lê e sobe foto
--     pelo cliente anônimo, em caminho antigo — e vai continuar assim em
--     aparelho que não recarregar o app. Fica com o mínimo que esse bundle usa:
--       · SELECT  → URL assinada;
--       · INSERT  → upload de arquivo novo (upsert sem conflito é só INSERT).
--     Fora: DELETE, e UPDATE — que é o que permite MOVER (renomear) e
--     sobrescrever o objeto alheio. Custo: um bundle antigo que retentar o
--     MESMO arquivo depois de subir (conflito → UPDATE) falha; a foto fica na
--     fila do aparelho e sobe pelo caminho novo quando o app atualizar.
--     E nada dentro de pasta de empresa: o que o app novo grava já nasce fechado.
--     Saem na fase D (20260924_storage_02_revoga_anon.sql).
drop policy if exists anon_storage_all on storage.objects;

drop policy if exists checklist_photos_anon_transicao_leitura on storage.objects;
create policy checklist_photos_anon_transicao_leitura
  on storage.objects for select
  to anon
  using (bucket_id = 'checklist-photos'
         and not public.checklist_photos_pasta_de_empresa(name));

drop policy if exists checklist_photos_anon_transicao_envio on storage.objects;
create policy checklist_photos_anon_transicao_envio
  on storage.objects for insert
  to anon
  with check (bucket_id = 'checklist-photos'
              and not public.checklist_photos_pasta_de_empresa(name));


-- ── 3. Primeiro inventário ──────────────────────────────────────────────────
drop table if exists _st01_inv;
create temp table _st01_inv as select * from public.checklist_photos_inventariar_legado();


-- ============================================================================
-- VERIFICAÇÃO — nas linhas VERIFICAÇÃO, `valor` tem de bater com `esperado`.
-- As linhas INVENTÁRIO dizem quantos objetos antigos há em cada situação:
--   dono     → serão copiados para a pasta da empresa (fase C);
--   revisar  → citado por mais de uma empresa, ou só por ponteiro: decidir à
--              mão (select * from public.checklist_photos_legado
--                    where status in ('revisar','conflito'));
--   sem_dono → nenhuma linha do banco aponta: arquivo órfão;
--   conflito → a estrutura aponta duas empresas (não deveria existir).
-- ============================================================================
with verif(n, item, valor, esperado) as (
  select 1, 'anon_storage_all ainda existe',
         (select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'anon_storage_all')::text, '0'
  union all
  select 2, 'policies de anon/public com DELETE ou UPDATE em storage.objects',
         (select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and cmd in ('ALL', 'DELETE', 'UPDATE')
             and ('anon' = any(roles) or 'public' = any(roles)))::text, '0'
  union all
  select 3, 'policies de checklist-photos para authenticated (3 tenant + 1 legado)',
         (select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('checklist_photos_tenant_leitura', 'checklist_photos_tenant_envio',
                                'checklist_photos_tenant_regravacao', 'checklist_photos_legado_leitura'))::text, '4'
  union all
  select 4, 'policies antigas que liberavam o bucket inteiro ao authenticated',
         (select count(*) from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname like 'checklist_photos_authenticated_%')::text, '0'
  union all
  select 5, 'bucket checklist-photos público?',
         coalesce((select public::text from storage.buckets where id = 'checklist-photos'), 'NÃO EXISTE'), 'false'
  union all
  select 6, 'anon/authenticated alcançam a tabela do inventário',
         (has_table_privilege('anon', 'public.checklist_photos_legado', 'SELECT')
          or has_table_privilege('authenticated', 'public.checklist_photos_legado', 'SELECT'))::text, 'false'
  union all
  select 7, 'authenticated executa o inventário',
         has_function_privilege('authenticated', 'public.checklist_photos_inventariar_legado()', 'EXECUTE')::text, 'false'
)
select ord, bloco, item, valor, esperado from (
  select 100 as ord, 'INVENTÁRIO' as bloco, situacao as item, objetos::text as valor, '' as esperado from _st01_inv
  union all
  select 500 + n, 'VERIFICAÇÃO', item, valor, esperado from verif
  union all
  -- Todas as policies que sobram para anon/public em storage.objects, para
  -- conferir de olho: esperado só colaboradores_*, company_logos_public_read,
  -- user_avatars_public_read e as duas checklist_photos_anon_transicao_*.
  select 900, 'ANON RESTANTE', policyname, cmd || ' · ' || coalesce(qual, with_check, ''), ''
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and ('anon' = any(roles) or 'public' = any(roles))
) tudo
order by ord, item;


-- ============================================================================
-- COMO CONFIRMAR NO APP — vale mais que a verificação acima
--
--   Antes do deploy (app de hoje, cliente anônimo):
--     1. Abrir um relatório com foto: tem de abrir (anon lê o legado).
--     2. Executar um checklist com foto: tem de subir.
--     3. /cadastro com selfie: tem de enviar (bucket `colaboradores` não mudou).
--   Depois do deploy (cliente autenticado):
--     4. Mesmos 1 e 2. A foto nova aparece em Storage → checklist-photos dentro
--        da pasta com o id da empresa.
--     5. Um POP antigo abre; um POP novo sobe e abre.
--
-- ROLLBACK de emergência (devolve o vazamento — é saída de incêndio):
--   create policy anon_storage_all on storage.objects for all to anon
--     using (bucket_id = 'checklist-photos') with check (bucket_id = 'checklist-photos');
-- Com o bucket confinado, já não reabre `colaboradores` e os outros. As policies
-- `checklist_photos_tenant_*` e `_legado_leitura` podem ficar: só somam leitura
-- da própria empresa.
-- ============================================================================
