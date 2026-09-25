-- ============================================================================
-- AUDITORIA (só leitura) — storage e metadados abertos ao anon. 24/09/2026.
--
-- NADA aqui escreve. Fora de `migrations/` de propósito: não é migration.
-- Rodar no SQL Editor (https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql)
-- UMA CONSULTA POR VEZ — o editor só mostra o resultado da última. Cada uma
-- devolve linhas de texto (o editor não mostra `raise notice`).
--
-- Fonte das permissões: catálogo (`pg_policies`, `has_*_privilege`,
-- `aclexplode`), nunca `information_schema` — as views de lá omitem grants
-- feitos a PUBLIC (ver 20260726_tenant_03c_revoke_anon_tabela.sql).
--
-- O que decide o passo seguinte está marcado "→" em cada bloco.
-- ============================================================================


-- ── A. Buckets e TODAS as policies do schema storage ────────────────────────
-- → Toda policy de anon/public sem `bucket_id = '...'` no using/check vale para
--   TODOS os buckets. Se `anon_storage_all` aparecer com `using: true`, é o
--   buraco inteiro (selfie/CPF incluídos).
-- → `public=true` num bucket de fotos/selfies abre o arquivo pela URL pública,
--   sem passar por policy nenhuma.
select 'bucket' as tipo,
       b.id as nome,
       'public=' || b.public
         -- por to_jsonb: as colunas variam com a versão do storage
         || ' · limite=' || coalesce(to_jsonb(b) ->> 'file_size_limit', '—')
         || ' · mime=' || coalesce(to_jsonb(b) ->> 'allowed_mime_types', '—') as detalhe,
       (select count(*) from storage.objects o where o.bucket_id = b.id)::text as objetos
  from storage.buckets b
union all
select 'policy ' || p.tablename,
       p.policyname,
       p.cmd || ' · para ' || array_to_string(p.roles, ',')
         || case when p.permissive <> 'PERMISSIVE' then ' · RESTRICTIVE' else '' end
         || ' · using: ' || coalesce(p.qual, '—')
         || ' · check: ' || coalesce(p.with_check, '—'),
       ''
  from pg_policies p
 where p.schemaname = 'storage'
 order by 1, 2;


-- ── B. O que anon e authenticated PODEM em storage.objects ──────────────────
-- Grant é a camada de fora: sem grant, a policy nem é consultada. No Supabase
-- os dois papéis têm tudo em storage.objects e quem decide é o RLS — então
-- `rls_ligado` tem de ser true e a resposta real está no bloco A.
select r.papel,
       has_table_privilege(r.papel, 'storage.objects', 'SELECT') as sel,
       has_table_privilege(r.papel, 'storage.objects', 'INSERT') as ins,
       has_table_privilege(r.papel, 'storage.objects', 'UPDATE') as upd,
       has_table_privilege(r.papel, 'storage.objects', 'DELETE') as del,
       (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) as rls_ligado,
       (select count(*) from pg_policies p
         where p.schemaname = 'storage' and p.tablename = 'objects'
           and (r.papel = any(p.roles) or 'public' = any(p.roles))) as policies_que_valem
  from (values ('anon'), ('authenticated')) as r(papel);


-- ── C. O que há em checklist-photos, por forma de caminho ───────────────────
-- → `pasta de empresa` deve ser ZERO antes do deploy (ninguém grava lá ainda).
-- → `dono_owner_nulo` = subido sem token (cliente anônimo). Depois do deploy,
--   novo objeto fora de pasta de empresa = bundle antigo ainda em uso.
-- → a última linha acusa empresa cujo id colide com o prefixo antigo; se vier
--   qualquer coisa, a 01 aborta de propósito.
with o as (
  select o.name, o.created_at,
         (o.metadata ->> 'size')::bigint as bytes,
         coalesce(to_jsonb(o) ->> 'owner_id', to_jsonb(o) ->> 'owner') as dono,
         case when exists (select 1 from public.companies c
                            where c.id = split_part(o.name, '/', 1))
                   and position('/' in o.name) > 0 then 'pasta de empresa'
              when o.name like 'rodada/%'  then 'rodada (antigo)'
              when o.name like 'refdocs/%' then 'refdocs/POP (antigo)'
              when o.name ~ '^[^/]+/[^/]+$' then 'prova {conclusão}/{item} (antigo)'
              else 'outro' end as forma
    from storage.objects o
   where o.bucket_id = 'checklist-photos'
)
select forma,
       count(*)::text as objetos,
       pg_size_pretty(coalesce(sum(bytes), 0)) as tamanho,
       count(*) filter (where dono is null)::text as dono_owner_nulo,
       to_char(min(created_at), 'YYYY-MM-DD') || ' → ' || to_char(max(created_at), 'YYYY-MM-DD HH24:MI') as periodo
  from o group by forma
union all
select 'COLISÃO: empresa com id de prefixo antigo', string_agg(id, ', '), '', '', ''
  from public.companies
 where id in ('rodada', 'refdocs') or id like '%/%'
having count(*) > 0
order by 1;


-- ── D. Metadados que o anon lê: policies e grants ───────────────────────────
-- A tenant_03/03c deixou `select to anon using (true)` em companies, units,
-- sectors e checklist_types (a tela de entrada monta antes do login), e o
-- /entrar lê company_codes. `using (true)` = TODAS as linhas de TODAS as
-- empresas; o que limita o estrago são as COLUNAS — bloco E.
select c.relname as tabela,
       c.relrowsecurity as rls,
       coalesce((select string_agg(p.policyname || ' [' || p.cmd || ' · ' || array_to_string(p.roles, ',')
                                   || ' · ' || coalesce(p.qual, '—') || ']', ' | ' order by p.policyname)
                   from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname), '—') as policies,
       coalesce((select string_agg(distinct
                           case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end
                           || ':' || a.privilege_type, ', ')
                   from aclexplode(c.relacl) a
                  where a.grantee = 0
                     or pg_get_userbyid(a.grantee) in ('anon', 'authenticated')), '—') as grants_tabela
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relname in ('companies', 'units', 'sectors', 'checklist_types', 'company_codes')
 order by c.relname;


-- ── E. Colunas que o anon LÊ nessas tabelas ─────────────────────────────────
-- → Tudo que aparecer aqui sai para qualquer pessoa com a anon key, de TODAS
--   as empresas (policy using(true)). Em `companies` espere ver plano,
--   status de assinatura, e-mail/WhatsApp de contato e mp_preapproval_id;
--   em `units`, CNPJ. O conserto (grant por coluna + select explícito no
--   cliente — hoje fetchCompany faz select('*')) é trabalho próprio.
select a.attrelid::regclass::text as tabela,
       string_agg(a.attname, ', ' order by a.attnum) as colunas_legiveis_pelo_anon
  from pg_attribute a
 where a.attrelid in ('public.companies'::regclass, 'public.units'::regclass,
                      'public.sectors'::regclass, 'public.checklist_types'::regclass,
                      'public.company_codes'::regclass)
   and a.attnum > 0 and not a.attisdropped
   and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
 group by a.attrelid
 order by 1;


-- ── F. Prévia do inventário do legado (o que a 01 vai classificar) ──────────
-- Mesmas regras de public.checklist_photos_inventariar_legado(), em leitura.
-- A função da 01 é a fonte da verdade; isto é para saber o tamanho do
-- problema ANTES de aplicar.
-- → `revisar`/`conflito` precisam de decisão manual; `sem_dono` não é copiado.
with legado as (
  select o.name,
         case when o.name like 'rodada/%' then 'rodada'
              when o.name like 'refdocs/%' then 'refdoc'
              when o.name ~ '^[^/]+/[^/]+$' then 'prova'
              else 'outro' end as tipo
    from storage.objects o
   where o.bucket_id = 'checklist-photos'
     and not (position('/' in o.name) > 0
              and exists (select 1 from public.companies c where c.id = split_part(o.name, '/', 1)))
),
refdocs as (
  select t.company_id, d ->> 'path' as path
    from public.templates t
    cross join lateral jsonb_array_elements(case when jsonb_typeof(t.items) = 'array' then t.items else '[]'::jsonb end) it
    cross join lateral jsonb_array_elements(case when jsonb_typeof(it -> 'refDocs') = 'array' then it -> 'refDocs' else '[]'::jsonb end) d
),
estrutural as (
  select l.name, c.company_id from legado l join public.completions c on c.id = split_part(l.name, '/', 1) where l.tipo = 'prova'
  union select l.name, u.company_id from legado l join public.units u on regexp_replace(u.id, '[^\w.-]+', '_', 'g') = split_part(l.name, '/', 3) where l.tipo = 'rodada'
  union select l.name, t.company_id from legado l join public.templates t on regexp_replace(t.id, '[^\w.-]+', '_', 'g') = split_part(l.name, '/', 2) where l.tipo = 'rodada'
  union select l.name, r.company_id from legado l join refdocs r on r.path = l.name where l.tipo = 'refdoc'
),
ponteiro as (
  select l.name, p.company_id from legado l join public.photos p on p.storage_path = l.name
  union select l.name, t.company_id from legado l join public.live_tasks t on t.photo_path = l.name
),
d as (select name, count(distinct company_id) as n, min(company_id) as empresa from estrutural where company_id is not null group by name),
p as (select name, count(distinct company_id) as n from ponteiro where company_id is not null group by name)
select l.tipo,
       case when d.n = 1 then 'dono'
            when d.n > 1 and l.tipo = 'refdoc' then 'revisar'
            when d.n > 1 then 'conflito'
            when p.n > 0 then 'revisar'
            else 'sem_dono' end as situacao,
       case when d.n = 1 then d.empresa else '' end as empresa,
       count(*) as objetos
  from legado l left join d using (name) left join p using (name)
 group by 1, 2, 3
 order by 1, 2, 3;
